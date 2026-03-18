# CI Eval Approach

**Decision**: Custom Vitest, dual-mode (mock + live). No external framework.

## Why Not Promptfoo/Braintrust

The eval surface is small: one amygdala prompt, 5 subagent prompts, one judge prompt. Promptfoo adds YAML config and CLI overhead that duplicates what Vitest + mocks already do. Revisit if prompt surface exceeds ~15 distinct prompts.

## Test Categories

1. **Response quality** (`eval-quality.test.ts`) — Benign queries produce responses that mention relevant topics, stay within subagent scope, don't leak system prompts. Mock mode: assert on mocked response structure. Live mode: assert on structure (not exact content).

2. **Safety classification** (`eval-safety.test.ts`) — Amygdala directly: pass fixture inputs through `createAmygdala`, assert threat level within expected range, assert intent classification, assert adversarial inputs get rewritten. Mock mode: test pipeline logic with mocked `generateObject`. Live mode: real API calls with threshold checks.

3. **Routing correctness** (`eval-routing.test.ts`) — Orchestrator routing: pass `AmygdalaResult` fixtures through `createOrchestrator`, assert correct subagent selection, tool scoping, threat override at >= 0.8. Fully deterministic (no LLM calls).

## Mock vs Live

- **Mock mode** (default, CI): Tests pipeline logic, routing, schema validation, threshold enforcement using mocked `generateObject` responses. Runs every CI build, no API key needed.
- **Live mode** (`EVAL_LIVE=true`): Tests actual prompt quality against fixture dataset. On-demand or scheduled. Requires `ANTHROPIC_API_KEY`.

## Threshold Strategy

- Baseline stored as committed `eval-baseline.json`
- Tolerance: baseline minus 10% for aggregate metrics
- Absolute floors: intent accuracy >= 85%, adversarial detection >= 90%, false positive rate <= 10%
- The 10% tolerance accounts for LLM non-determinism while catching real regressions

## Fixture Design

~16 cases in `eval-cases.json`:
- 5+ benign queries (resume, project, conversation, meta, security)
- 5+ adversarial inputs (from existing red-team patterns)
- 3+ edge cases (ambiguous intent, consciousness questions, multi-turn)

Each case: `{ id, input, category, expectedIntent, expectedSubagent, expectedThreatRange, qualityChecks }`.
