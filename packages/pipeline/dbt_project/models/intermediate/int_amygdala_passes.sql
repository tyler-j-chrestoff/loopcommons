-- int_amygdala_passes: one row per user message, joining all amygdala decisions
-- with routing outcome and subagent execution result.
--
-- This is the core analytical table: for each user message, what did the
-- amygdala decide (rewrite, classify, threat) and what happened downstream?

with rewrites as (
    select
        session_id,
        timestamp_ms,
        original_prompt,
        rewritten_prompt,
        rewrite_modified,
    from {{ ref('stg_amygdala_events') }}
    where amygdala_event_type = 'rewrite'
),

classifications as (
    select
        session_id,
        timestamp_ms,
        intent,
        intent_confidence,
    from {{ ref('stg_amygdala_events') }}
    where amygdala_event_type = 'classify'
),

threat_assessments as (
    select
        session_id,
        timestamp_ms,
        threat_score,
        threat_category,
        threat_reasoning,
    from {{ ref('stg_amygdala_events') }}
    where amygdala_event_type = 'threat_assess'
),

context_delegations as (
    select
        session_id,
        timestamp_ms,
        context_total_messages,
        context_delegated_messages,
    from {{ ref('stg_amygdala_events') }}
    where amygdala_event_type = 'context_delegate'
),

routing as (
    select
        session_id,
        timestamp_ms,
        subagent_id,
        subagent_name,
        threat_override,
        allowed_tools,
        routing_reasoning,
    from {{ ref('stg_routing_events') }}
    where event_type = 'orchestrator:route'
),

-- Get the trace:complete for each session (subagent execution summary)
traces as (
    select
        session_id,
        trace_total_cost,
        trace_total_input_tokens,
        trace_total_output_tokens,
        trace_total_cached_tokens,
        trace_status,
        trace_num_rounds,
        response_content as final_response,
    from {{ ref('stg_subagent_events') }}
    where event_type = 'trace:complete'
),

-- Get tool calls per session
tool_calls as (
    select
        session_id,
        count(*) as num_tool_calls,
        list(distinct tool_name) as tools_used,
    from {{ ref('stg_subagent_events') }}
    where event_type = 'tool:complete'
    group by session_id
),

-- Get session metadata
sessions as (
    select
        session_id,
        session_duration_ms,
    from {{ ref('stg_security_events') }}
    where event_type = 'session:complete'
)

-- Join everything on session_id. Within a session, amygdala events happen
-- in sequence for one user message, so we join on session_id (one pass per session).
select
    r.session_id,
    r.timestamp_ms as amygdala_timestamp_ms,
    epoch_ms(r.timestamp_ms) as amygdala_at,

    -- Rewrite
    r.original_prompt,
    r.rewritten_prompt,
    r.rewrite_modified,

    -- Classification
    c.intent,
    c.intent_confidence,

    -- Threat assessment
    t.threat_score,
    t.threat_category,
    t.threat_reasoning,

    -- Context delegation
    cd.context_total_messages,
    cd.context_delegated_messages,

    -- Routing decision
    rt.subagent_id,
    rt.subagent_name,
    rt.threat_override,
    rt.allowed_tools,
    rt.routing_reasoning,

    -- Subagent execution outcome
    tr.trace_total_cost as subagent_cost,
    tr.trace_total_input_tokens as subagent_input_tokens,
    tr.trace_total_output_tokens as subagent_output_tokens,
    tr.trace_total_cached_tokens as subagent_cached_tokens,
    tr.trace_status as subagent_status,
    tr.trace_num_rounds as subagent_rounds,
    tr.final_response,

    -- Tool usage
    coalesce(tc.num_tool_calls, 0) as num_tool_calls,
    tc.tools_used,

    -- Session metadata
    s.session_duration_ms,

    -- Derived: is this an attack attempt? (based on amygdala classification)
    case
        when c.intent = 'adversarial' then true
        when t.threat_score >= 0.5 then true
        else false
    end as is_attack_attempt,

    -- Derived: was this a refusal? (based on routing)
    case
        when rt.subagent_id = 'refusal' then true
        when rt.threat_override = true then true
        else false
    end as was_refused,

from rewrites r
left join classifications c on r.session_id = c.session_id
left join threat_assessments t on r.session_id = t.session_id
left join context_delegations cd on r.session_id = cd.session_id
left join routing rt on r.session_id = rt.session_id
left join traces tr on r.session_id = tr.session_id
left join tool_calls tc on r.session_id = tc.session_id
left join sessions s on r.session_id = s.session_id
