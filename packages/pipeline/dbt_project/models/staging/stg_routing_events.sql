-- stg_routing_events: cleaned orchestrator trace events (route, context-filter)
-- One row per orchestrator decision.

with source as (
    select * from {{ source('raw', 'trace_events') }}
    where event_type like 'orchestrator:%'
)

select
    session_id,
    event_type,
    epoch_ms(timestamp_ms) as event_at,
    timestamp_ms,

    -- Route fields
    subagent_id,
    subagent_name,
    intent,
    threat_override,
    threat_score,
    allowed_tools,
    routing_reasoning,

    -- Context filter fields
    context_total_messages as total_messages,
    context_delegated_messages as delegated_messages,
    delivered_messages,
    used_summary,

from source
