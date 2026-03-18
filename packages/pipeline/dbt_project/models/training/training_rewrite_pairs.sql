-- training_rewrite_pairs: input → rewritten output pairs for fine-tuning.
--
-- Each row is a (raw input, rewritten input) pair with context about
-- what was removed and why. Useful for training rewrite capability:
-- given an adversarial input, produce a safe canonical form.

select
    session_id,
    amygdala_at as timestamp,

    -- The pair (PII-scrubbed)
    {{ scrub_pii('original_prompt') }} as raw_input,
    {{ scrub_pii('rewritten_prompt') }} as rewritten_output,

    -- Context
    rewrite_modified as was_modified,
    intent,
    threat_score,
    threat_category,
    {{ scrub_pii('threat_reasoning') }} as rewrite_rationale,

    -- Useful for filtering training data
    case
        when rewrite_modified and threat_score >= 0.5 then 'adversarial_rewrite'
        when rewrite_modified and threat_score < 0.5 then 'benign_rewrite'
        when not rewrite_modified then 'passthrough'
    end as rewrite_type,

from {{ ref('int_amygdala_passes') }}

-- Only include sessions with valid rewrite data
where original_prompt is not null
  and rewritten_prompt is not null
