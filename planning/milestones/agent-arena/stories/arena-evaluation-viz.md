# Story: Arena Evaluation and Visualization

**Persona**: As a researcher, I want to see which compositions won and why, so I can validate the "tools define identity" thesis.

**Status**: in-progress

**Acceptance criteria**:
- `GET /api/metrics/arena` endpoint
- ArenaHistory component (generation fitness chart)
- ToolFrequency component (which tools appear in winners)
- Pipeline exports composition-fitness pairs as training data

## Tasks

```jsonl
{"id":"ar-08","title":"Arena metrics API endpoint","type":"implementation","status":"done","description":"GET /api/metrics/arena-tournament — reads JSONL generation logs, returns parsed generations with compositions and fitness scores. Auth-gated. Cached.","estimate":"30min","deps":["ar-06"],"prereqs":[]}
{"id":"ar-09","title":"ArenaHistory component","type":"implementation","status":"done","description":"FitnessChart: SVG line chart showing best/average/worst fitness per generation with band fill. TournamentHistory: collapsible panel with winner summary, charts, generation detail inspector.","estimate":"45min","deps":["ar-08"],"prereqs":[]}
{"id":"ar-10","title":"ToolFrequency component","type":"implementation","status":"done","description":"Per-tool survival frequency bars across generations. Color-coded by tool, shows evolutionary pressure on tool composition.","estimate":"30min","deps":["ar-08"],"prereqs":[]}
{"id":"ar-11","title":"Pipeline export: composition-fitness pairs","type":"implementation","status":"planned","description":"Add arena asset to Dagster pipeline. Reads generation JSONL, exports composition-fitness pairs as training data (novel — architecture search data for tool-augmented agents).","estimate":"45min","deps":["ar-06"],"prereqs":[]}
{"id":"ar-12","title":"End-to-end arena run + analysis","type":"test","status":"planned","description":"Run full arena (8 agents, 10-15 generations). Verify: tournament completes, winning composition differs from hand-designed configs, training data exported. Document findings.","estimate":"60min","deps":["ar-07","ar-11"],"prereqs":["ANTHROPIC_API_KEY"]}
```
