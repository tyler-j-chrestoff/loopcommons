# Story: Arena Visualization and Training Data Export

**Persona**: As a researcher, I want to see run replays, choice-point reasoning, and path comparison charts, so I can validate results and share findings.

**Status**: done

**Acceptance criteria**:
- `GET /api/metrics/arena` endpoint (auth-gated, reads JSONL traces)
- RunReplay component (step-through a run: encounters, choices, death/completion)
- PathComparison component (E4 approach distribution per path, clustering visualization)
- ChoicePointInspector component (crossroads reasoning side-by-side across paths)
- Pipeline exports choice-point reasoning as training data
- Pipeline exports approach-divergence pairs as training data

## Tasks

```jsonl
{"id":"rl-13","title":"Arena metrics API endpoint","type":"implementation","status":"done","description":"GET /api/metrics/arena — reads JSONL trace files from data/arena/, returns parsed runs with encounter results, choice points, death/completion, path statistics. Query params: experiment_id, path_id. Auth-gated. Cached. TDD.","estimate":"30min","deps":["rl-10"],"prereqs":[]}
{"id":"rl-14","title":"RunReplay component","type":"implementation","status":"done","description":"Step-through visualization of a single run. Shows: encounter prompt, agent reasoning trace, tool invocations, memory mutations, death/completion. At crossroads: shows full reasoning (4 sections), tool swap animation, identity hash change. Narrative legibility is the goal. TDD.","estimate":"60min","deps":["rl-13"],"prereqs":[]}
{"id":"rl-15","title":"PathComparison component","type":"implementation","status":"done","description":"Side-by-side comparison of E4 approach distributions across 4 paths + baseline. Bar chart of approach categories per path. Highlight clustering structure (primacy vs recency). Show chi-square result, Cramer's V, and pass/fail gate status. TDD.","estimate":"45min","deps":["rl-13"],"prereqs":[]}
{"id":"rl-16","title":"ChoicePointInspector component","type":"implementation","status":"done","description":"Side-by-side display of crossroads reasoning from different paths at the same choice point. Highlights divergent self-assessments and sacrifice reasoning. Memory state diff between paths. TDD.","estimate":"30min","deps":["rl-13"],"prereqs":[]}
{"id":"rl-17","title":"Pipeline: arena trace consolidation","type":"implementation","status":"done","description":"Dagster asset reads arena JSONL traces, flattens to Parquet (run-level and choice-point-level tables). Date-partitioned. Handles all event types. TDD.","estimate":"45min","deps":["rl-10"],"prereqs":[]}
{"id":"rl-18","title":"Pipeline: training data export","type":"implementation","status":"done","description":"Two novel exports: (1) choice-point reasoning pairs (same choice, different developmental context, different reasoning — the dataset that doesn't exist), (2) approach-divergence pairs (same final tools, different behavior, traceable to path). Versioned JSONL with SHA256 checksums. TDD.","estimate":"45min","deps":["rl-17"],"prereqs":[]}
```
