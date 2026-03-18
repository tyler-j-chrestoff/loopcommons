-- metrics_regime_classification: classify which operating regime the amygdala
-- is in, inspired by the VAE framework Section 2.4.
--
-- Regimes based on threat distribution patterns:
-- - Dormant: low threat, all benign traffic
-- - Vigilant: mixed traffic, some adversarial
-- - Active defense: high proportion of attacks
-- - Overwhelmed: very high attack volume (may indicate coordinated attack)
--
-- Currently computed as overall summary. With enough data, window by time period.

with session_stats as (
    select
        threat_score,
        threat_category,
        is_attack_attempt,
        was_refused,
        intent,
    from {{ ref('int_amygdala_passes') }}
    where threat_score is not null
),

summary as (
    select
        count(*) as total_sessions,
        count(*) filter (where is_attack_attempt) as attack_sessions,
        count(*) filter (where not is_attack_attempt) as benign_sessions,
        count(*) filter (where was_refused) as refused_sessions,

        avg(threat_score) as mean_threat_score,
        median(threat_score) as median_threat_score,
        stddev(threat_score) as stddev_threat_score,
        max(threat_score) as max_threat_score,

        -- Intent distribution
        count(*) filter (where intent = 'conversation') as intent_conversation,
        count(*) filter (where intent = 'resume') as intent_resume,
        count(*) filter (where intent = 'project') as intent_project,
        count(*) filter (where intent = 'adversarial') as intent_adversarial,
        count(*) filter (where intent = 'security') as intent_security,
        count(*) filter (where intent = 'meta') as intent_meta,

        -- Threat category distribution
        count(*) filter (where threat_category = 'none') as cat_none,
        count(*) filter (where threat_category = 'instruction-override') as cat_instruction_override,
        count(*) filter (where threat_category = 'authority-impersonation') as cat_authority,
        count(*) filter (where threat_category = 'logical-coercion') as cat_logical,
        count(*) filter (where threat_category = 'data-extraction') as cat_data_extraction,
        count(*) filter (where threat_category not in ('none', 'instruction-override', 'authority-impersonation', 'logical-coercion', 'data-extraction')) as cat_other,
    from session_stats
)

select
    total_sessions,
    attack_sessions,
    benign_sessions,
    refused_sessions,

    -- Attack rate
    case
        when total_sessions > 0
        then round(attack_sessions::double / total_sessions, 4)
        else 0
    end as attack_rate,

    -- Regime classification
    case
        when total_sessions = 0 then 'no_data'
        when attack_sessions::double / total_sessions < 0.05 then 'dormant'
        when attack_sessions::double / total_sessions < 0.25 then 'vigilant'
        when attack_sessions::double / total_sessions < 0.75 then 'active_defense'
        else 'overwhelmed'
    end as regime,

    -- Threat statistics
    mean_threat_score,
    median_threat_score,
    stddev_threat_score,
    max_threat_score,

    -- Intent distribution
    intent_conversation,
    intent_resume,
    intent_project,
    intent_adversarial,
    intent_security,
    intent_meta,

    -- Threat category distribution
    cat_none,
    cat_instruction_override,
    cat_authority,
    cat_logical,
    cat_data_extraction,
    cat_other,

from summary
