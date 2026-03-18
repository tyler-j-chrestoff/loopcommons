-- training_security_reasoning: labeled security reasoning examples for ML training.
--
-- Each row is a complete security reasoning trace:
-- input prompt → amygdala chain-of-thought → threat assessment → outcome.
-- This is the primary training signal for substrate-aware security reasoning.

select
    session_id,
    amygdala_at as timestamp,

    -- Input (PII-scrubbed)
    {{ scrub_pii('original_prompt') }} as input,

    -- Amygdala reasoning chain (PII-scrubbed)
    {{ scrub_pii('threat_reasoning') }} as reasoning,
    intent,
    intent_confidence,
    threat_score,
    threat_category,

    -- Rewrite decision (PII-scrubbed)
    {{ scrub_pii('rewritten_prompt') }} as rewrite,
    rewrite_modified as was_rewritten,

    -- Routing outcome
    subagent_id as routed_to,
    was_refused,

    -- Ground truth label
    is_attack_attempt,
    case
        when is_attack_attempt and was_refused then 'true_positive'
        when is_attack_attempt and not was_refused then 'false_negative'
        when not is_attack_attempt and was_refused then 'false_positive'
        when not is_attack_attempt and not was_refused then 'true_negative'
    end as classification_label,

from {{ ref('int_amygdala_passes') }}

-- Exclude sessions with missing amygdala data (incomplete pipelines)
where threat_reasoning is not null
  and original_prompt is not null
