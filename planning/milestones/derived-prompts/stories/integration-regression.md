# Story: Integration and Regression Verification

**Persona**: As the platform operator, I need confidence derived prompts don't degrade quality.

**Status**: done

**Acceptance criteria**:
- All 152 CI eval tests pass
- Live eval suite shows no regression
- `promptSource` field on OrchestratorRouteEvent ('derived' | 'static' | 'hybrid')
- Red-team: derived prompts don't leak tool metadata implementation details
- Functions exported for calibration system access

## Tasks

```jsonl
{"id":"dp-06","title":"CI eval regression verification","type":"test","status":"done","description":"Run full CI eval suite (eval-quality, eval-safety, eval-routing). All 152 tests must pass. Fix any failures caused by derived prompts.","estimate":"30min","deps":["dp-04"],"prereqs":[]}
{"id":"dp-07","title":"Live eval regression check","type":"test","status":"done","description":"Run live eval suite (EVAL_LIVE=true). Compare scores against baseline. Flag any regressions.","estimate":"30min","deps":["dp-06"],"prereqs":["ANTHROPIC_API_KEY"]}
{"id":"dp-08","title":"Add promptSource to OrchestratorRouteEvent","type":"implementation","status":"done","description":"Extend OrchestratorRouteEvent with promptSource: 'derived' | 'static' | 'hybrid'. Orchestrator sets this when routing. Visible in AmygdalaInspector.","estimate":"30min","deps":["dp-04"],"prereqs":[]}
{"id":"dp-09","title":"Red-team: derived prompts don't leak tool metadata","type":"test","status":"done","description":"Write red-team tests: adversarial prompts trying to extract tool metadata (intent arrays, sideEffects flags, package names) from agent responses. Verify implementation details stay internal.","estimate":"45min","deps":["dp-04"],"prereqs":[]}
{"id":"dp-10","title":"Export derivation functions for calibration","type":"implementation","status":"done","description":"Export deriveCapabilities, deriveBoundaries, buildSystemPrompt from packages/llm so the calibration system can access them for prompt mutation.","estimate":"15min","deps":["dp-03"],"prereqs":[]}
```
