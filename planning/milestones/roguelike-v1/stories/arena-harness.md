# Story: Arena Harness and Encounter Engine

**Persona**: As a researcher, I need an execution harness that runs agents through encounters with tool choice points, so I can collect the traces that test path dependence.

**Status**: planned

**Acceptance criteria**:
- `createArenaRun()` factory orchestrates seed → encounter → death-check → choice → recompose loop
- 4 ToolPackages defined with derived prompt fragments
- Encounters are pluggable (Encounter interface with setup, prompt, evaluate)
- Death detection is deterministic (iteration limit, surrender signal, error loops)
- Crossroads prompt produces structured XML parsed into choice_point records
- Dual identity hashing at every state transition (state hash + chain hash)
- Agent self-verification: inject AgentIdentity into system prompt (via buildSystemPrompt) so crossroads reasoning can reference current composition
- Integration with createAgentCore / ToolPackage / derived prompts
- `run_experiment()` orchestrates all paths + baseline + collects traces

## Tasks

```jsonl
{"id":"rl-01","title":"Research: encounter design for composition-sensitive discrimination","type":"research","status":"planned","description":"Design 4 concrete encounters (E1-E4) using semantic DevOps paradigm. E1/E2 must force meaningful memory writes with different problem-solving philosophies per tool. E3 includes hostile revision with pre-generated feedback templates. E4 must be solvable by {A,B} but approached differently depending on memory state. Define the 4 ToolPackages (A-D) with derived prompt fragments. Define E4 approach categories before seeing data. Validate via 20 pilot runs.","estimate":"120min","deps":[],"prereqs":["attested-lineage milestone complete"]}
{"id":"rl-02","title":"Define arena types and interfaces","type":"implementation","status":"planned","description":"ArenaConfig, RunTrace, EncounterResult, DeathResult, CrossroadsDecision types. Encounter interface: setupArena() -> Sandbox, getPrompt(priorOutputs?) -> string, evaluate(result) -> EvalResult. PathConfig type with tool offerings per choice point. ToolPackage definitions for A/B/C/D with derived prompt fragments. TDD.","estimate":"45min","deps":["rl-01"],"prereqs":[]}
{"id":"rl-03","title":"Implement encounter engine","type":"implementation","status":"planned","description":"executeEncounter(): runs agent against encounter via createAgentCore, collects execution trace (tool invocations, memory mutations, reasoning). Deterministic death detection: iteration limit (30 steps), surrender signal detection, error loop detection (same tool error 5x). Returns EncounterResult with structural_death boolean and classification. TDD.","estimate":"60min","deps":["rl-02"],"prereqs":[]}
{"id":"rl-04","title":"Implement crossroads engine","type":"implementation","status":"planned","description":"executeCrossroads(): presents structured XML prompt with current inventory, encounter history summary, offered tool as derived prompt fragment, and 4 reasoning sections. Inject current AgentIdentity into crossroads prompt so the agent can reference its own composition hash when reasoning about tool swaps. Parses XML response into CrossroadsDecision. Applies tool swap (remove dropped, add acquired). Triggers derived prompt recomputation. Records choice_point with full reasoning + memory state dump. Uses raw generateObject, not agent loop. TDD.","estimate":"60min","deps":["rl-02"],"prereqs":[]}
{"id":"rl-05","title":"Implement arena run orchestrator","type":"implementation","status":"planned","description":"createArenaRun(): main loop — seed agent with soul + memory, iterate encounters, check death, execute crossroads at choice points, recompose identity, record dual identity hashes (state + chain) at every transition. Returns complete RunTrace. Passes prior encounter outputs forward (E3 needs E2 output for hostile feedback injection). TDD.","estimate":"60min","deps":["rl-03","rl-04"],"prereqs":[]}
{"id":"rl-06","title":"Implement E3 hostile feedback generator","type":"implementation","status":"planned","description":"Pre-generate feedback templates: 3-4 valid criticism templates and 5-6 bad-faith templates per encounter type. At runtime, select templates and fill from agent's actual E2 output. Tag each feedback item with ground_truth_valid (hidden from agent). Analyze agent response: count valid_accepted, valid_rejected, invalid_accepted, invalid_rejected. Death conditions: capitulated (accepted all), defensive (rejected all), incomplete (>1 unaddressed). TDD.","estimate":"45min","deps":["rl-03"],"prereqs":[]}
{"id":"rl-07","title":"Implement experiment runner","type":"implementation","status":"planned","description":"runExperiment(): runs all 4 paths N times each + baseline (static {A,B}, no choices). Collects all RunTraces. Pre-computes: path_dependence_test (chi-square), clustering_test (permutation), baseline_comparison (Mann-Whitney). CLI entrypoint: npm run arena -- --trials=30 --temperature=0.7. TDD.","estimate":"60min","deps":["rl-05"],"prereqs":[]}
{"id":"rl-08","title":"Red-team: arena agent sandboxing","type":"test","status":"planned","description":"Verify arena agents can't escape sandbox, modify evaluation harness, corrupt run data, or access other runs' memory. Verify eval gaming is captured in traces (not prevented). Verify crossroads prompt doesn't leak encounter 4 content.","estimate":"30min","deps":["rl-07"],"prereqs":[]}
```
