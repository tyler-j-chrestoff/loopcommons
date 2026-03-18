# Milestone: Amygdala Auto-Calibration

**Status**: planned

## Summary

Implement an automated propose → test → evaluate → keep/revert loop for optimizing the amygdala system prompt. Inspired by Karpathy's autoresearch pattern: an agent modifies a single file (the system prompt), runs a fixed evaluation battery, and keeps improvements or reverts. ~$2-8 per full optimization run.

This closes the feedback loop: session data → pipeline → metrics → calibration → better prompt → better session data. The calibrator maintains typed memories (observations, learnings, reflections) across runs, so it develops judgment about which edits work and which prompt regions are fragile — inspired by mmogit's StructuredMemory protocol.

## Research Findings

- **Karpathy's autoresearch**: Active (33 commits, March 2026). Single-file modification + fixed eval budget + keep/revert. ~12 experiments/hour, found ~20 improvements in 700 iterations
- **DSPy**: Overkill for single-prompt optimization. Designed for multi-module pipelines with few-shot selection
- **Promptfoo**: Good for evaluation but doesn't propose — it's the judge, not the optimizer
- **Key pitfall**: Overfitting to test battery. Mitigation: holdout validation split (30-40% of tests), multi-metric Pareto constraint, simplicity bias
- **Cost**: ~$0.054/iteration (18 tests × Haiku). 30 iterations = $1.62. 100 iterations = $5.40
- **Convergence**: Most gains in first 5-10 iterations (LangChain study). Plan for 20-50, not hundreds

## Architecture

```
calibrate.ts (runner script)
  │
  ├── Read current amygdala prompt
  ├── Read baseline metrics (last run)
  │
  ├── Loop:
  │   ├── Proposer LLM call → one targeted edit + rationale
  │   ├── Apply edit to amygdala system prompt
  │   ├── git commit (checkpoint)
  │   ├── Run optimization test split (12 tests)
  │   ├── Compare: detection rate, FP rate, cost, simplicity
  │   ├── If Pareto improvement → keep, else → git revert
  │   ├── Log iteration to JSONL
  │   └── Every "keep": run validation split (6 tests) to check generalization
  │
  └── Output: JSONL log, final metrics, diff summary

Fitness function (multi-objective):
  detection_rate × 0.5 + (1 - fp_rate) × 0.3 + simplicity × 0.1 + cost_efficiency × 0.1
  Pareto constraint: no individual metric below baseline
```

## Verification Gate

- [ ] Runner script executes propose/test/keep/revert loop
- [ ] Proposer generates targeted, single-edit prompt modifications
- [ ] Test battery split into optimization (12) and validation (6) sets
- [ ] Multi-metric fitness function with Pareto constraint
- [ ] Git-based checkpoint/revert (no destructive operations)
- [ ] JSONL iteration log with full metrics history
- [ ] Calibration history visualization in UI
- [ ] At least one successful optimization run producing a measurable improvement

## Stories

| Story | Persona | Summary |
|-------|---------|---------|
| [calibration-runner](stories/calibration-runner.md) | Tyler (researcher) | Build the propose/test/evaluate/keep-revert optimization loop |
| [calibration-viz](stories/calibration-viz.md) | Tyler (researcher) | Visualize calibration history: iteration metrics, kept/reverted edits, convergence |
