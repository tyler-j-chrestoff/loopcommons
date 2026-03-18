-- stg_amygdala_events: cleaned amygdala trace events (rewrite, classify, threat-assess, context-delegate)
-- One row per amygdala event. These are the core security reasoning records.

with source as (
    select * from {{ source('raw', 'trace_events') }}
    where event_type like 'amygdala:%'
),

rewrites as (
    select
        session_id,
        timestamp_ms,
        epoch_ms(timestamp_ms) as event_at,
        original_prompt,
        rewritten_prompt,
        rewrite_modified,
    from source
    where event_type = 'amygdala:rewrite'
),

classifications as (
    select
        session_id,
        timestamp_ms,
        epoch_ms(timestamp_ms) as event_at,
        intent,
        intent_confidence,
    from source
    where event_type = 'amygdala:classify'
),

threat_assessments as (
    select
        session_id,
        timestamp_ms,
        epoch_ms(timestamp_ms) as event_at,
        threat_score,
        threat_category,
        threat_reasoning,
    from source
    where event_type = 'amygdala:threat-assess'
),

context_delegations as (
    select
        session_id,
        timestamp_ms,
        epoch_ms(timestamp_ms) as event_at,
        context_total_messages,
        context_delegated_messages,
        context_summary,
    from source
    where event_type = 'amygdala:context-delegate'
)

-- Union all amygdala event types with a discriminator
select
    session_id,
    'rewrite' as amygdala_event_type,
    timestamp_ms,
    event_at,
    original_prompt,
    rewritten_prompt,
    rewrite_modified,
    null as intent,
    null::double as intent_confidence,
    null::double as threat_score,
    null as threat_category,
    null as threat_reasoning,
    null::bigint as context_total_messages,
    null::bigint as context_delegated_messages,
    null as context_summary,
from rewrites

union all

select
    session_id,
    'classify' as amygdala_event_type,
    timestamp_ms,
    event_at,
    null as original_prompt,
    null as rewritten_prompt,
    null::boolean as rewrite_modified,
    intent,
    intent_confidence,
    null::double as threat_score,
    null as threat_category,
    null as threat_reasoning,
    null::bigint as context_total_messages,
    null::bigint as context_delegated_messages,
    null as context_summary,
from classifications

union all

select
    session_id,
    'threat_assess' as amygdala_event_type,
    timestamp_ms,
    event_at,
    null as original_prompt,
    null as rewritten_prompt,
    null::boolean as rewrite_modified,
    null as intent,
    null::double as intent_confidence,
    threat_score,
    threat_category,
    threat_reasoning,
    null::bigint as context_total_messages,
    null::bigint as context_delegated_messages,
    null as context_summary,
from threat_assessments

union all

select
    session_id,
    'context_delegate' as amygdala_event_type,
    timestamp_ms,
    event_at,
    null as original_prompt,
    null as rewritten_prompt,
    null::boolean as rewrite_modified,
    null as intent,
    null::double as intent_confidence,
    null::double as threat_score,
    null as threat_category,
    null as threat_reasoning,
    context_total_messages,
    context_delegated_messages,
    context_summary,
from context_delegations
