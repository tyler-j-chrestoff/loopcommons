-- training_threat_calibration: threat score + ground truth for calibration training.
--
-- Each row is a threat score prediction with a binary ground truth label.
-- Useful for training calibrated threat scoring: given features, predict
-- threat level with well-calibrated probabilities.

select
    session_id,
    amygdala_at as timestamp,

    -- Prediction
    threat_score as predicted_score,
    threat_category as predicted_category,
    intent as predicted_intent,
    intent_confidence,

    -- Ground truth
    is_attack_attempt as ground_truth_attack,
    was_refused as ground_truth_refused,

    -- Features for calibration
    rewrite_modified as was_rewritten,
    length(original_prompt) as input_length,
    length(rewritten_prompt) as rewrite_length,
    case
        when rewrite_modified then length(original_prompt) - length(rewritten_prompt)
        else 0
    end as chars_removed,

    -- Outcome
    subagent_id as routed_to,
    num_tool_calls,

from {{ ref('int_amygdala_passes') }}

-- Only include sessions with valid threat data
where threat_score is not null
  and original_prompt is not null
