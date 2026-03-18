-- stg_subagent_events: cleaned trace events from subagent execution
-- Covers round:start, round:complete, tool:start, tool:complete, trace:complete

with source as (
    select * from {{ source('raw', 'trace_events') }}
    where event_type in ('round:start', 'round:complete', 'tool:start', 'tool:complete', 'trace:complete')
)

select
    session_id,
    event_type,
    epoch_ms(timestamp_ms) as event_at,
    timestamp_ms,

    -- Round fields
    round_index,
    round_latency_ms,
    response_content,
    input_tokens,
    output_tokens,
    cached_tokens,
    round_cost,
    finish_reason,

    -- Tool fields
    tool_name,
    tool_input,
    tool_output,
    tool_error,
    tool_latency_ms,

    -- Trace summary fields
    trace_id,
    trace_model,
    trace_provider,
    trace_total_cost,
    trace_total_input_tokens,
    trace_total_output_tokens,
    trace_total_cached_tokens,
    trace_status,
    trace_num_rounds,

from source
