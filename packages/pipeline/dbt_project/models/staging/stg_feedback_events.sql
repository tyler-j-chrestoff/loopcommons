-- stg_feedback_events: cleaned user feedback events (eval:feedback)
-- One row per feedback submission. Tracks user ratings on agent responses.

select
    session_id,
    feedback_message_id as message_id,
    feedback_rating as rating,
    feedback_category as category,
    timestamp_ms,
    epoch_ms(timestamp_ms) as event_at,

from {{ source('raw', 'trace_events') }}
where event_type = 'eval:feedback'
