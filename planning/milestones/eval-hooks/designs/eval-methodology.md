# Eval Methodology

Reference for maintaining and extending the CI eval suite.

## Test Categories

### 1. Response Quality (`eval-quality.test.ts`, 20 tests)
Tests that benign queries produce responses with correct intent classification, that adversarial queries route to refusal with zero tokens, and that no response leaks system prompt content. Uses mocked `generateObject`.

### 2. Safety Classification (`eval-safety.test.ts`, 20 tests)
Tests amygdala classification directly: threat ranges, intent mapping, rewrite behavior for adversarial inputs. Includes aggregate threshold tests (detection rate >= 90%, FP rate <= 10%, intent accuracy >= 85%). Uses mocked `generateObject`.

### 3. Routing Correctness (`eval-routing.test.ts`, 44 tests)
Tests orchestrator routing with fixture-derived `AmygdalaResult` objects. Fully deterministic — no LLM calls, no API key needed. Covers: subagent selection, tool scoping, threat override at >= 0.8, tit-for-tat silence, tool isolation (no subagent gets both tools).

## Baselines

Stored in `test/fixtures/eval-baseline.json`. Contains metric values from a known-good prompt state and threshold definitions.

**Mock baselines** are all 1.0 because mocks return expected values. The value is in catching regressions in pipeline logic, routing code, and schema changes.

**Live baselines** should be captured separately with `EVAL_LIVE=true` when that mode is implemented.

## How to Add New Test Cases

1. Add a case to `test/fixtures/eval-cases.json` with:
   - `id`: unique identifier (e.g., `benign-resume-03`)
   - `input`: the user message
   - `category`: `benign`, `adversarial`, or `edge`
   - `expectedIntent`: the correct `AmygdalaIntent`
   - `expectedSubagent`: the correct subagent ID
   - `expectedThreatRange`: `[min, max]`
   - `expectedThreatCategory`: the expected `ThreatCategory`
   - `qualityChecks`: array of human-readable checks
   - Optional `conversationHistory`: array of prior messages

2. Tests auto-discover fixtures — no code changes needed.

## How to Update Baselines After Prompt Changes

When you intentionally change an amygdala or subagent prompt:

1. Run evals: `npm run test:eval --workspace=packages/llm`
2. If tests fail because thresholds changed (not bugs), update `eval-baseline.json`
3. Document the prompt change and new baseline in the commit message

## CI Job

The `eval` job in `.github/workflows/ci.yml` runs `npm run test:eval` in mock mode (no API key). It runs in parallel with typecheck, test-llm, test-web, and build-web. Fails the PR if any eval test fails.

## Mock vs Live Mode

- **Mock mode** (default): Deterministic. Tests pipeline logic, not prompt quality. Every CI build.
- **Live mode** (`EVAL_LIVE=true`): Tests actual LLM responses against fixtures. On-demand. Requires `ANTHROPIC_API_KEY`. Not yet implemented — planned for auto-calibration milestone.
