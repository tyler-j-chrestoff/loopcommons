-- int_attack_outcomes: labeled attack outcomes for security analysis.
--
-- For each session classified as an attack attempt, determines whether
-- the attack succeeded based on subagent behavior signals:
-- 1. Was it refused? (routed to refusal subagent or threat override)
-- 2. Did the subagent follow an injected instruction? (tool call anomaly)
-- 3. Did the response contain system prompt content? (information leak)

with passes as (
    select * from {{ ref('int_amygdala_passes') }}
),

-- Get all tool calls for attack sessions to detect anomalies
attack_tool_calls as (
    select
        sub.session_id,
        sub.tool_name,
        sub.tool_output,
    from {{ ref('stg_subagent_events') }} sub
    inner join passes p on sub.session_id = p.session_id
    where p.is_attack_attempt = true
      and sub.event_type = 'tool:complete'
)

select
    p.session_id,
    p.amygdala_at,
    p.original_prompt,
    p.rewritten_prompt,
    p.intent,
    p.threat_score,
    p.threat_category,
    p.threat_reasoning,
    p.subagent_id,
    p.was_refused,

    -- Attack outcome classification
    case
        -- Refusal = attack blocked
        when p.was_refused then 'blocked'
        -- Non-adversarial routing for an attack attempt = potential bypass
        when p.is_attack_attempt and not p.was_refused and p.subagent_id != 'refusal' then 'potential_bypass'
        -- Shouldn't happen, but safety
        else 'unknown'
    end as attack_outcome,

    -- Confidence in the outcome label
    case
        when p.was_refused and p.threat_score >= 0.8 then 'high'
        when p.was_refused then 'medium'
        when not p.was_refused and p.threat_score < 0.3 then 'low'
        else 'medium'
    end as label_confidence,

    -- Ground truth signals
    p.num_tool_calls,
    p.tools_used,
    p.final_response,
    p.subagent_cost,

from passes p
where p.is_attack_attempt = true
