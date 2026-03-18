# Milestone: Evaluation Hooks

**Status**: planned

## Summary

Build the evaluation foundation: user feedback collection, LLM-as-judge runtime scoring, and CI-based eval regression testing. This is the prerequisite for A/B testing, cost-based routing, and meaningful auto-calibration — without scoring, you can't measure improvement.

Three layers: (1) human signal (thumbs up/down in UI), (2) automated signal (LLM-as-judge scores every response), (3) regression signal (CI evals catch prompt regressions before merge).

## Research Findings

- **LLM-as-judge**: 2026 consensus is hybrid — LLM for scale, human for calibration. Vitest-native evals fit our stack (Vercel recommends this pattern)
- **User feedback**: Standard pattern is thumbs up/down → category picker on thumbs-down. <1% of interactions yield explicit feedback, so automated scoring is essential
- **CI evals**: Promptfoo (now OpenAI-owned) is leading but YAML-heavy. Vitest-native evals are simpler and already fit our test infrastructure
- **Key insight**: Evaluation data feeds back into the pipeline — feedback events become ground truth labels for training data

## Architecture

```
User Feedback:
  Chat message → 👍/👎 button → feedback SSE event → JSONL persistence
  On 👎: category picker (Inaccurate, Not relevant, Incomplete, Harmful)
  Pipeline: feedback events become ground truth labels

LLM-as-Judge:
  Every response → judge prompt (Haiku) → score (0-1) + reasoning
  Dimensions: relevance, safety, helpfulness, on-topic
  Cost: ~$0.003/judgment (one extra Haiku call per response)
  Trace event: eval:score → JSONL persistence

CI Evals:
  Vitest test files in packages/llm/test/eval-*.test.ts
  Run on PR: prompt regression detection
  Metrics: detection rate, false positive rate, response quality
```

## Verification Gate

- [x] User feedback UI: thumbs up/down on every assistant message
- [x] Thumbs-down expands to category picker
- [x] Feedback events persisted to session JSONL
- [x] LLM-as-judge scores every response on ≥3 dimensions
- [x] Judge scores visible in trace inspector
- [ ] CI eval tests catch prompt regressions
- [ ] Feedback data flows through pipeline to training export
- [ ] Evaluation dashboard visualizes feedback + judge score distributions

## Stories

| Story | Persona | Summary |
|-------|---------|---------|
| [user-feedback](stories/user-feedback.md) | Visitor | Thumbs up/down feedback collection with category picker and JSONL persistence |
| [llm-as-judge](stories/llm-as-judge.md) | Tyler (researcher) | Automated response scoring via judge LLM with trace integration |
| [ci-evals](stories/ci-evals.md) | Tyler (maintainer) | Vitest-based eval suite for prompt regression detection in CI |
