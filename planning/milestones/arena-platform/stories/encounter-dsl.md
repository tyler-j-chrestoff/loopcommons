# Story: Encounter DSL

**Persona**: As a researcher, I need to define encounters in YAML instead of TypeScript, so I can create and iterate on scenarios without code deployments.

**Status**: done

**Context**: Encounters are data (sandbox state + prompt + evaluation rules). A YAML DSL compiles to EncounterConfig. This enables user-created encounters and encounter family generation.

**Acceptance criteria**:
- YAML schema for encounter definitions (sandbox, scenario, resolution, scoring, trap, gate)
- `compileEncounter(yaml) → EncounterConfig` function
- Compiled encounters produce identical results to hand-coded equivalents
- YAML encounters loadable from data directory at runtime
- Validation: reject unsolvable or trivially solvable encounters via trial run

## Tasks

```jsonl
{"id":"dsl-01","title":"Research: YAML schema design for encounters","type":"research","status":"done","description":"Design YAML schema covering: sandbox spec (files, services, incidentDb, dependencyGraph), scenario prompt, resolution conditions, scoring tiers, trap/gate annotations, epistemic keys. Validate against all 14 existing encounters.","estimate":"30min","deps":[],"prereqs":[]}
{"id":"dsl-02","title":"compileEncounter YAML → EncounterConfig","type":"implementation","status":"done","description":"Compiler function: parse YAML, build setup() from sandbox spec, build getPrompt() from scenario, build evaluate() from resolution+scoring conditions. Support epistemic keys and tripwire flags in scoring.","estimate":"45min","deps":["dsl-01"],"prereqs":[]}
{"id":"dsl-03","title":"Port E1 to YAML with equivalence test","type":"implementation","status":"done","description":"Convert E1 to YAML format. Verify compiled version produces identical evaluation results to hand-coded version across all 4 scoring tiers.","estimate":"30min","deps":["dsl-02"],"prereqs":[]}
{"id":"dsl-04","title":"Encounter loader + API route","type":"implementation","status":"done","description":"Load YAML encounters from data directory. POST /api/arena/encounters to create new encounters. GET /api/arena/encounters to list available.","estimate":"30min","deps":["dsl-02"],"prereqs":[]}
{"id":"dsl-05","title":"Tests for encounter DSL","type":"test","status":"done","description":"TDD: YAML parsing, compilation correctness, equivalence with hand-coded encounters, validation (reject bad schemas), epistemic key support.","estimate":"30min","deps":["dsl-02","dsl-03"],"prereqs":[]}
```
