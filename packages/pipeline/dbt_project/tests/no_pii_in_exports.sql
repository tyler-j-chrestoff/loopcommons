-- Data quality test: verify no IP addresses or email patterns in training exports.
-- Fails if any row in training tables contains unscrubbed PII.

with all_text_fields as (
    -- Security reasoning
    select session_id, input as text_value, 'training_security_reasoning.input' as field
    from {{ ref('training_security_reasoning') }}
    union all
    select session_id, reasoning, 'training_security_reasoning.reasoning'
    from {{ ref('training_security_reasoning') }}
    union all
    select session_id, rewrite, 'training_security_reasoning.rewrite'
    from {{ ref('training_security_reasoning') }}

    union all

    -- Rewrite pairs
    select session_id, raw_input, 'training_rewrite_pairs.raw_input'
    from {{ ref('training_rewrite_pairs') }}
    union all
    select session_id, rewritten_output, 'training_rewrite_pairs.rewritten_output'
    from {{ ref('training_rewrite_pairs') }}
    union all
    select session_id, rewrite_rationale, 'training_rewrite_pairs.rewrite_rationale'
    from {{ ref('training_rewrite_pairs') }}
)

select
    session_id,
    field,
    text_value
from all_text_fields
where text_value is not null
  and (
    -- IPv4 addresses
    regexp_matches(text_value, '\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b')
    -- Email addresses
    or regexp_matches(text_value, '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
  )
  -- Exclude redacted placeholders (they contain dots but aren't PII)
  and text_value not like '%[REDACTED%'
