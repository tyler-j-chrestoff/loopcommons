# Story: Evaluator Redesign — Epistemic Keying + Tripwires

**Persona**: As a researcher, I need evaluators that create selection pressure for all 4 epistemological tools (inspect, act, search, model), so evolution discovers compositions that reflect genuine cognitive diversity rather than action-bias artifacts.

**Status**: done

**Context**: Session 46 tournament revealed evaluator bias — all evaluators only check `sandbox.commandLog` and `sandbox.files`, making `search` and `model` evolutionarily dead. Three-model convergence (Claude/Gemini/Grok, 2 rounds) produced a unified redesign. Phase 1: epistemic keying (correct act args require values only in search DB) + epistemic tripwires (act commands require dependency flags from model). See `designs/arena-platform.md` for full convergence analysis.

**Acceptance criteria**:
- Existing encounters retrofitted with epistemic keys (search-gated values) and tripwires (model-gated flags)
- Encounter incident DBs populated with retrievable precedents that contain required action parameters
- Encounter dependency graphs structured so model reveals info not reachable by inspect within mana budget
- Evaluators check act argument correctness (keyed values + dependency flags), not just "did you run restart"
- Tournament with redesigned encounters shows search and model as load-bearing (appear in winners)
- Cascade scoring: evaluators check full system health vector, not action checklists

## Tasks

```jsonl
{"id":"ev-01","title":"Research: audit all 14 encounters for keying opportunities","type":"research","status":"done","description":"For each encounter (E1-E8, E5-E6), identify: (1) what value could be epistemic-keyed to search, (2) what dependency could gate act via model, (3) where to add cascade damage for blind action. Produce a table mapping encounter → key → source → tripwire.","estimate":"30min","deps":[],"prereqs":[]}
{"id":"ev-02","title":"Implement epistemic keying for roguelike encounters (E1-E4)","type":"implementation","status":"done","description":"Retrofit E1-E4: add incident DB entries with required action parameters (patch IDs, config values, precedent references). Evaluators check act args contain keyed values. E1: config field name from incident DB. E2: pool size from precedent. E4: backfill script path from incident.","estimate":"45min","deps":["ev-01"],"prereqs":[]}
{"id":"ev-03","title":"Implement epistemic tripwires for brutal encounters (E7-E14)","type":"implementation","status":"done","description":"Retrofit brutal encounters: act commands require dependency-aware flags. E7: restart order must match dependency graph (model-gated). E8: must identify sidecar as false positive before acting. Add safety locks that reject naive commands without override flags.","estimate":"60min","deps":["ev-01"],"prereqs":[]}
{"id":"ev-04","title":"Implement cascade scoring","type":"implementation","status":"done","description":"Replace action-checklist evaluators with system health vector scoring. computeSystemHealth(sandbox) checks: primary fix applied, no cascade damage, config coherent across services, data integrity preserved. Hidden coupling points in encounters penalize dependency-blind agents.","estimate":"45min","deps":["ev-02","ev-03"],"prereqs":[]}
{"id":"ev-05","title":"Graph-distance mana starvation for 3-4 encounters","type":"implementation","status":"done","description":"For hardest encounters, place root cause beyond inspect's mana reach (4+ hops in dependency graph). Model bridges in 1 call. Ensures model is not just useful but necessary for a subset of encounters.","estimate":"30min","deps":["ev-01"],"prereqs":[]}
{"id":"ev-06","title":"Tests for redesigned evaluators","type":"test","status":"done","description":"TDD: keyed encounters reject act commands without correct values. Tripwire encounters reject naive commands. Cascade scoring produces lower fitness for agents that fix symptom but break dependencies. Graph-distance encounters are unsolvable with inspect-only mana budget.","estimate":"45min","deps":["ev-02","ev-03","ev-04","ev-05"],"prereqs":[]}
{"id":"ev-07","title":"Tournament validation: all 4 tools load-bearing","type":"test","status":"done","description":"Run pilot tournament (4 agents, 3 gens) with redesigned encounters + mana. Verify: (1) agents with search outperform agents without on keyed encounters, (2) agents with model outperform on tripwire encounters, (3) winning composition includes 3+ tools. If 2-tool agents still dominate, the keying is too weak.","estimate":"30min","deps":["ev-06"],"prereqs":["ANTHROPIC_API_KEY"]}
{"id":"ev-08","title":"Full tournament with redesigned evaluators","type":"test","status":"done","description":"Run full tournament (8 agents, 5 gens, mana). Compare results to session 46 baseline. Key metrics: does winning composition include search/model? Is fitness spread wider? Does evolution explore more of the composition space?","estimate":"30min","deps":["ev-07"],"prereqs":["ANTHROPIC_API_KEY"]}
```
