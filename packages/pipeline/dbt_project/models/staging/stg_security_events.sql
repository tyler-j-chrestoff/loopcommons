-- stg_security_events: cleaned security and operational events
-- Covers security:*, rate-limit:status, spend:status, session:start/complete, error

with source as (
    select * from {{ source('raw', 'trace_events') }}
    where event_type in (
        'security:input-sanitized',
        'security:input-rejected',
        'rate-limit:status',
        'spend:status',
        'session:start',
        'session:complete',
        'error'
    )
)

select
    session_id,
    event_type,
    epoch_ms(timestamp_ms) as event_at,
    timestamp_ms,

    -- Security fields
    security_reason,

    -- Rate limit fields
    rate_limit_remaining,
    rate_limit_limit,
    active_connections,
    concurrency_limit,
    reset_ms,

    -- Spend fields
    current_spend_usd,
    daily_cap_usd,
    remaining_usd,
    percent_used,
    reset_at_utc,

    -- Session summary fields
    session_message_count,
    session_event_count,
    session_duration_ms,

    -- Error fields
    error_message,

from source
