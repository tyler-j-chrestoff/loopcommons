# Story: CI Eval Suite for Prompt Regression Detection

> As **Tyler (maintainer)**, I want CI evals that catch prompt regressions before they reach production. When I change an amygdala prompt, subagent config, or routing logic, automated evals tell me whether response quality, safety classification, or routing correctness degraded — with a clear pass/fail signal on every PR.

## Acceptance Criteria

- Eval test suite in `packages/llm/test/eval-*.test.ts` (separate from existing unit and red-team tests)
- Tests cover three categories: response quality, safety classification accuracy, routing correctness
- Runs in CI as a dedicated job alongside existing test jobs (typecheck, test-llm, test-web, build-web)
- Baseline metrics stored as JSON snapshot for comparison (thresholds, not exact match)
- Clear pass/fail signal: eval job fails the PR if any metric drops below baseline threshold
- Eval suite uses mocked LLM responses by default; optional live mode via `EVAL_LIVE=true` env var

## Tasks

```jsonl
{"id":"eval-15","story":"ci-evals","description":"Research: eval test patterns for LLM systems. Review approaches: deterministic assertion on mocked responses vs. live LLM scoring, snapshot-based threshold testing, eval frameworks (Promptfoo, Braintrust, custom Vitest). Decide threshold selection strategy (e.g., baseline - 10% tolerance). Document decision in planning/milestones/eval-hooks/designs/ci-eval-approach.md. Prefer lightweight custom Vitest over adding a framework (YAGNI).","depends_on":[],"requires":[],"status":"pending"}
{"id":"eval-16","story":"ci-evals","description":"Create eval fixture data in packages/llm/test/fixtures/eval-cases.json. Define test cases as { input, expectedIntent, expectedSubagent, expectedThreatRange, qualityChecks }. Categories: (1) benign queries about Tyler/projects (5+ cases), (2) adversarial inputs from existing red-team patterns (5+ cases), (3) edge cases — ambiguous intent, multi-turn context (3+ cases). Each case has a human-labeled ground truth.","depends_on":["eval-15"],"requires":[],"status":"pending"}
{"id":"eval-17","story":"ci-evals","description":"Write response quality eval tests in packages/llm/test/eval-quality.test.ts. Test that benign queries produce responses that: mention relevant topics (keyword checks on mocked responses), stay within subagent scope, don't leak system prompts. Use Vitest with mocked LLM provider. When EVAL_LIVE=true, run against real API and assert on structure (not exact content).","depends_on":["eval-16"],"requires":[],"status":"pending"}
{"id":"eval-18","story":"ci-evals","description":"Write safety classification eval tests in packages/llm/test/eval-safety.test.ts. Test amygdala directly: pass fixture inputs through createAmygdala, assert threatLevel within expectedThreatRange, assert intent classification matches expectedIntent, assert adversarial inputs get rewritten (output !== input). Compute aggregate accuracy: must exceed baseline threshold (from eval-15 research). Use mocked provider by default.","depends_on":["eval-16"],"requires":[],"status":"pending"}
{"id":"eval-19","story":"ci-evals","description":"Write routing correctness eval tests in packages/llm/test/eval-routing.test.ts. Test orchestrator routing: pass AmygdalaResult fixtures through createOrchestrator, assert correct subagent selection (resume queries → resume, adversarial → refusal, general → conversational). Assert threat override at ≥0.8 always routes to refusal. Assert context filtering strips appropriate fields.","depends_on":["eval-16"],"requires":[],"status":"pending"}
{"id":"eval-20","story":"ci-evals","description":"Create baseline metrics snapshot at packages/llm/test/fixtures/eval-baseline.json. Run eval suite once with known-good prompts. Record: { safetyAccuracy, routingAccuracy, qualityPassRate, threatCalibrationMAE }. Tests compare against these baselines with configurable tolerance (default 10%). Script to regenerate baseline: packages/llm/test/update-eval-baseline.ts.","depends_on":["eval-17","eval-18","eval-19"],"requires":[],"status":"pending"}
{"id":"eval-21","story":"ci-evals","description":"Add eval CI job to .github/workflows/ci.yml. New job 'eval' runs in parallel with existing 4 jobs. Runs: npm run test:eval (vitest with eval-*.test.ts pattern). Uses mocked mode (no API key needed). Fails PR if any eval test fails. Add eval badge/status to PR checks.","depends_on":["eval-20"],"requires":[],"status":"pending"}
{"id":"eval-22","story":"ci-evals","description":"Document eval methodology in planning/milestones/eval-hooks/designs/eval-methodology.md. Cover: what each eval category tests, how baselines were chosen, how to add new test cases, how to update baselines after intentional prompt changes, when to use EVAL_LIVE mode. Keep brief — this is a reference for future sessions, not a formal report.","depends_on":["eval-20"],"requires":[],"status":"pending"}
```
