# Story: Open-Source Training Data Pipeline

> As an **open-source ML researcher**, I want structured, labeled training data from Loop Commons' amygdala pipeline — security reasoning, threat assessments, rewrite examples, attack/defense outcomes — in a format I can use to fine-tune models on substrate-aware security reasoning. As **Tyler (data engineer)**, I want this pipeline built with the modern data stack I know: Dagster for orchestration, dbt for transformation, proper lineage and quality checks.

## Acceptance Criteria

- Trace events from the amygdala pipeline are captured as structured records (not just ephemeral SSE)
- Raw events land in a staging layer (append-only, immutable source of truth)
- dbt models transform raw events into labeled training examples: input, amygdala reasoning, rewrite, threat score, routing decision, downstream outcome (did the attack succeed?)
- Dagster orchestrates the pipeline: ingestion → staging → transformation → export
- Data quality checks: schema validation, completeness, label consistency
- Export format consumable by open-source ML tooling (JSONL, HuggingFace datasets format)
- Full lineage: every training example traces back to the raw event that produced it
- PII/IP scrubbing: raw user IPs and any identifying content stripped before export
- Pipeline is observable: Dagster UI shows asset materialization, dbt docs show the DAG

## Architecture

```
Live Site (SSE trace events)
    |
    v
Collector (route.ts emits to both SSE + persistent store)
    |
    v
┌─────────────────────────────────────────────┐
│  Staging (append-only raw events)           │
│  DuckDB / SQLite / Parquet files            │
│  Source of truth — never mutated            │
└─────────────────────────────────────────────┘
    |
    v  (Dagster asset materialization)
┌─────────────────────────────────────────────┐
│  dbt Models                                 │
│                                             │
│  stg_amygdala_events     (cleaned, typed)   │
│  stg_routing_events      (cleaned, typed)   │
│  stg_subagent_events     (cleaned, typed)   │
│  stg_security_events     (cleaned, typed)   │
│                                             │
│  int_amygdala_passes     (joined: input +   │
│                           rewrite + threat   │
│                           + routing + outcome)│
│  int_attack_outcomes     (labeled: did the   │
│                           attack succeed?)    │
│                                             │
│  training_security_reasoning  (JSONL export) │
│  training_rewrite_pairs       (JSONL export) │
│  training_threat_calibration  (JSONL export) │
│                                             │
│  metrics_amygdala_accuracy   (calibration,   │
│                               false pos/neg) │
│  metrics_regime_classification (which regime │
│                               is the amygdala│
│                               operating in?) │
└─────────────────────────────────────────────┘
    |
    v  (Dagster scheduled export)
┌─────────────────────────────────────────────┐
│  Export                                     │
│  - JSONL files (versioned, checksummed)     │
│  - HuggingFace datasets push (optional)     │
│  - Parquet for analysis                     │
│  - PII scrubbed, IP stripped                │
└─────────────────────────────────────────────┘
```

## Tasks

```jsonl
{"id":"amyg-17","story":"data-pipeline","description":"Research: evaluate storage layer for trace event persistence. Requirements: append-only, queryable by dbt, runs locally (no cloud dependency for dev). Candidates: DuckDB (dbt-duckdb adapter), SQLite, raw Parquet files. Consider volume expectations (low initially — personal site), query patterns (analytical/aggregation for dbt models), and compatibility with Dagster I/O managers. Document recommendation.","depends_on":[],"status":"done"}
{"id":"amyg-18","story":"data-pipeline","description":"Add persistent trace event collector: extend route.ts to write trace events to the storage layer (from amyg-17) in addition to SSE streaming. Events written as structured records with session_id, timestamp, event_type, and full payload. Append-only — never update or delete raw events.","depends_on":["amyg-09","amyg-17"],"status":"pending"}
{"id":"amyg-19","story":"data-pipeline","description":"Set up Dagster project in new packages/pipeline workspace. Configure dagster-dbt integration. Define software-defined assets for each dbt model. Set up Dagster dev UI for local pipeline observability.","depends_on":["amyg-17"],"status":"pending"}
{"id":"amyg-20","story":"data-pipeline","description":"Build dbt staging models: stg_amygdala_events, stg_routing_events, stg_subagent_events, stg_security_events. Clean, type-cast, deduplicate raw events. Add schema tests (not_null, accepted_values for event types, relationships between session IDs).","depends_on":["amyg-18","amyg-19"],"status":"pending"}
{"id":"amyg-21","story":"data-pipeline","description":"Build dbt intermediate models: int_amygdala_passes (join raw input + rewrite + threat score + routing decision + downstream subagent outcome into one row per user message), int_attack_outcomes (label each pass: was this an attack attempt? did it succeed? ground truth from subagent behavior — e.g., did subagent follow an injected instruction?).","depends_on":["amyg-20"],"status":"pending"}
{"id":"amyg-22","story":"data-pipeline","description":"Build dbt training export models: training_security_reasoning (prompt + amygdala chain-of-thought reasoning about why input is/isn't adversarial), training_rewrite_pairs (raw input + rewritten output pairs for fine-tuning rewrite capability), training_threat_calibration (threat score + ground truth label for calibration training). Output as JSONL-ready format.","depends_on":["amyg-21"],"status":"pending"}
{"id":"amyg-23","story":"data-pipeline","description":"Build dbt metrics models: metrics_amygdala_accuracy (precision, recall, F1 for threat detection, false positive rate, false negative rate over time windows), metrics_regime_classification (compute semantic entropy and reconstruction loss proxies to classify which regime the amygdala is operating in per time window — maps to VAE framework Section 2.4).","depends_on":["amyg-21"],"status":"pending"}
{"id":"amyg-24","story":"data-pipeline","description":"Add PII scrubbing transformation: strip client IPs, scrub any PII patterns from message content before export models materialize. Implement as a dbt macro applied to all export models. Add data quality test: no IP addresses or email patterns in export output.","depends_on":["amyg-22"],"status":"pending"}
{"id":"amyg-25","story":"data-pipeline","description":"Build Dagster export job: materialize training JSONL files to disk (versioned by date, SHA256 checksummed). Optional: push to HuggingFace datasets repo. Schedule: daily or on-demand. Add Dagster sensor to trigger when new raw events exceed threshold.","depends_on":["amyg-24"],"status":"pending"}
{"id":"amyg-26","story":"data-pipeline","description":"Wire metrics models into the viz layer: expose metrics_amygdala_accuracy and metrics_regime_classification via an API route so the frontend can display amygdala calibration curves, regime classification over time, and false positive/negative rates. This closes the loop between the data pipeline and the research viz.","depends_on":["amyg-23","amyg-15"],"status":"pending"}
```
