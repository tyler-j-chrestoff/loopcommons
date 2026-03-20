# Story: Trace Schema and Storage

**Persona**: As a researcher, I need structured storage for run traces, choice-point reasoning, and identity lineage, so downstream analysis can test the path-dependence hypothesis.

**Status**: planned

**Acceptance criteria**:
- 4-table schema: agent_lineage, runs, execution_traces, choice_points
- Content-addressed identity hashes (state + chain) stored at every transition
- Choice points store full structured reasoning (4 sections) + memory state dump
- JSONL storage for runs (reuse session persistence pattern)
- Analysis queries: approach clustering, path comparison, confidence correlation

## Tasks

```jsonl
{"id":"rl-09","title":"Define trace data schema","type":"implementation","status":"planned","description":"4 tables/types: agent_lineage (lineage_sha PK, parent_sha, soul_version, active_tools[], created_at), runs (run_id PK, path_id, starting_lineage_sha, is_victory, death_encounter_id, death_classification), execution_traces (trace_id+step_index+call_index PK, lineage_sha, tool_name, result_text, is_error), choice_points (choice_id PK, run_id FK, encounter_number, current_lineage_sha, memory_state_hash, memory_state_dump, offered_tools[], self_assessment, acquisition_reasoning, sacrifice_reasoning, forward_model, selected_tool, dropped_tool, confidence_score, resulting_lineage_sha, prompt_rendered, response_raw, response_parsed). TDD.","estimate":"45min","deps":[],"prereqs":[]}
{"id":"rl-10","title":"Implement trace writer","type":"implementation","status":"planned","description":"ArenaTraceWriter: JSONL append per run (reuse FileSessionWriter pattern). Writes run header, encounter results, choice points, death/completion events. Atomic append with fsync. Output to data/arena/{experiment_id}/{run_id}.jsonl. TDD.","estimate":"30min","deps":["rl-09"],"prereqs":[]}
{"id":"rl-11","title":"Implement analysis queries","type":"implementation","status":"planned","description":"Pure functions over RunTrace arrays: classifyE4Approach(trace) -> ApproachCategory (based on first substantive tool invocation + integration method), chiSquarePathDependence(traces) -> {chi2, p, cramersV}, permutationClusteringTest(traces, n=10000) -> {primacyP, recencyP}, mannWhitneyBaseline(pathTraces, baselineTraces) -> {U, p, direction}. TDD with synthetic traces.","estimate":"60min","deps":["rl-09"],"prereqs":[]}
{"id":"rl-12","title":"Pre-registration script","type":"implementation","status":"planned","description":"npm run arena:preregister — freezes experiment config (encounter content, tool definitions, soul doc, feedback templates, approach category rubric, temperature, N) into a content-hashed JSON file. Prints hash. Any change to config requires new experiment ID. Commits analysis script with dummy data. TDD.","estimate":"30min","deps":["rl-11"],"prereqs":[]}
```
