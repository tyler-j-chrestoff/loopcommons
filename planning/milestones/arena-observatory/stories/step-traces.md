# Story: Step Trace Persistence

**Persona**: As the platform, I need to persist every tool call an agent makes during every encounter, so that replays, graveyard, and training data export are possible.

**Status**: done

**Context**: `executeEncounter()` returns full `ExecuteEncounterOutput` (steps, death, encounterResult) but the tournament task battery collapses this into a `TaskResult` and discards the steps. The step-level data is the most valuable artifact — it shows *how* an agent died, not just *that* it died.

**Acceptance criteria**:
- `executeEncounter` accepts an optional `onEncounterComplete` callback
- Callback receives agent context + full `ExecuteEncounterOutput` (steps, death, result)
- Callback is non-blocking (async/buffered) so it doesn't add latency to fitness evaluation
- Tournament runner wires callback to disk writer
- Per-tournament traces stored at `data/arena/tournaments/{id}/traces/{agentId}/{encounterId}.jsonl`
- Existing tests unaffected (callback is optional)

## Tasks

```jsonl
{"id":"st-01","title":"Research: executeEncounter call sites + trace schema","type":"research","status":"done","description":"Audit all callers of executeEncounter (task-battery, arena-run, tests). Design the callback signature and trace file schema. Verify non-blocking write won't skew fitness timing.","estimate":"20min","deps":[],"prereqs":[]}
{"id":"st-02","title":"Add onEncounterComplete callback to executeEncounter","type":"implementation","status":"done","description":"Optional callback parameter on ExecuteEncounterInput. Called after evaluate() with full output. Must not block the return. All existing callers unaffected (callback is optional).","estimate":"25min","deps":["st-01"],"prereqs":[]}
{"id":"st-03","title":"Trace writer for step-level JSONL","type":"implementation","status":"done","description":"Function that writes ExecuteEncounterOutput to per-agent per-encounter JSONL files. Atomic append with fsync (same pattern as TournamentWriter). Directory structure: tournaments/{id}/traces/{agentId}/{encounterId}.jsonl.","estimate":"25min","deps":["st-01"],"prereqs":[]}
{"id":"st-04","title":"Wire trace writer into tournament runner","type":"implementation","status":"done","description":"Tournament runner creates trace writer, passes onEncounterComplete to task battery, which passes it through to executeEncounter. Every tournament encounter now persists step traces to disk.","estimate":"20min","deps":["st-02","st-03"],"prereqs":[]}
{"id":"st-05","title":"Tests for step trace persistence","type":"test","status":"done","description":"TDD: callback fires with correct data, trace files written to expected paths, existing tests pass without callback, non-blocking behavior verified, trace schema matches expected shape.","estimate":"25min","deps":["st-02","st-03","st-04"],"prereqs":[]}
```
