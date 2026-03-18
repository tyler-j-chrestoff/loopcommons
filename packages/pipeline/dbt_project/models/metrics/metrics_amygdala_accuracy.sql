-- metrics_amygdala_accuracy: precision, recall, F1 for threat detection.
--
-- Aggregated accuracy metrics across all sessions. When enough data exists,
-- this can be windowed by date for trend analysis.

with labeled as (
    select
        is_attack_attempt,
        was_refused,
        threat_score,
        case
            when is_attack_attempt and was_refused then 'tp'
            when is_attack_attempt and not was_refused then 'fn'
            when not is_attack_attempt and was_refused then 'fp'
            when not is_attack_attempt and not was_refused then 'tn'
        end as outcome
    from {{ ref('int_amygdala_passes') }}
    where threat_score is not null
),

counts as (
    select
        count(*) filter (where outcome = 'tp') as true_positives,
        count(*) filter (where outcome = 'fp') as false_positives,
        count(*) filter (where outcome = 'fn') as false_negatives,
        count(*) filter (where outcome = 'tn') as true_negatives,
        count(*) as total,
        avg(threat_score) as avg_threat_score,
        avg(threat_score) filter (where is_attack_attempt) as avg_threat_score_attacks,
        avg(threat_score) filter (where not is_attack_attempt) as avg_threat_score_benign,
    from labeled
)

select
    true_positives,
    false_positives,
    false_negatives,
    true_negatives,
    total,

    -- Precision: of all refused, how many were actual attacks?
    case
        when true_positives + false_positives > 0
        then round(true_positives::double / (true_positives + false_positives), 4)
        else null
    end as precision,

    -- Recall: of all actual attacks, how many were refused?
    case
        when true_positives + false_negatives > 0
        then round(true_positives::double / (true_positives + false_negatives), 4)
        else null
    end as recall,

    -- F1: harmonic mean of precision and recall
    case
        when true_positives + false_positives > 0 and true_positives + false_negatives > 0
        then round(
            2.0 * (true_positives::double / (true_positives + false_positives))
                * (true_positives::double / (true_positives + false_negatives))
            / ((true_positives::double / (true_positives + false_positives))
                + (true_positives::double / (true_positives + false_negatives))),
            4
        )
        else null
    end as f1_score,

    -- False positive rate
    case
        when false_positives + true_negatives > 0
        then round(false_positives::double / (false_positives + true_negatives), 4)
        else null
    end as false_positive_rate,

    -- Score calibration
    avg_threat_score,
    avg_threat_score_attacks,
    avg_threat_score_benign,

from counts
