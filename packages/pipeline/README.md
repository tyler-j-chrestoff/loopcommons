# packages/pipeline — Data Pipeline

Dagster + dbt pipeline: raw session JSONL → consolidated Parquet → dbt models → training JSONL exports.

## Setup

```bash
# Create venv (requires Python 3.11-3.13)
python3.13 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Consolidate raw session data to Parquet
python -c "
from loopcommons_pipeline.assets.consolidation import _read_jsonl_files, _flatten_events
from pathlib import Path
web = Path('../web/data/sessions')
wh = Path('../../data/warehouse')
for d in sorted(web.iterdir()):
    if not d.is_dir(): continue
    events = _read_jsonl_files(d)
    if not events: continue
    df = _flatten_events(events)
    out = wh / 'events' / f'date={d.name}'
    out.mkdir(parents=True, exist_ok=True)
    df.write_parquet(out / 'events.parquet')
    print(f'{d.name}: {len(df)} events')
"

# Run dbt
cd dbt_project
dbt run    # materialize models
dbt test   # run data quality tests

# Launch Dagster UI (optional)
cd ..
dagster dev
```

## Architecture

```
packages/web/data/sessions/{date}/{id}.jsonl  (raw, append-only)
    ↓  consolidated_events (Dagster asset)
data/warehouse/events/date={date}/events.parquet
    ↓  dbt-duckdb
data/warehouse/loopcommons.duckdb (staging → intermediate → training/metrics)
    ↓  training_export (Dagster asset)
data/exports/training/{table}_{date}.jsonl + .sha256
```

## dbt Models

| Layer | Model | Description |
|-------|-------|-------------|
| staging | stg_amygdala_events | Rewrites, classifications, threat assessments, context delegations |
| staging | stg_routing_events | Orchestrator routing decisions and context filtering |
| staging | stg_subagent_events | Rounds, tool calls, trace summaries |
| staging | stg_security_events | Rate limits, spend, sanitization, sessions, errors |
| intermediate | int_amygdala_passes | One row per user message: all amygdala decisions + outcome |
| intermediate | int_attack_outcomes | Labeled attack outcomes (blocked/bypassed) |
| training | training_security_reasoning | Labeled security reasoning examples (PII-scrubbed) |
| training | training_rewrite_pairs | Input → rewritten output pairs (PII-scrubbed) |
| training | training_threat_calibration | Threat scores with ground truth labels |
| metrics | metrics_amygdala_accuracy | Precision, recall, F1, false positive rate |
| metrics | metrics_regime_classification | Operating regime from threat distribution |
