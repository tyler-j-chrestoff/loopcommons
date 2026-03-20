# Milestone: Agent Arena

**Status**: planned
**Sessions**: 2-3
**Stories**: 2
**Prerequisite**: multi-interface

Evolutionary selection over random tool compositions. The first empirical test of "tools define identity."

## Key Decisions

- Minimal arena: single-elimination tournament on a task battery. 8 agents, 10-20 generations.
- Agents composed from ToolPackage pool with dependency-aware random sampling.
- System prompts fully derived (no hand-written prompts — the whole point).
- Fitness reuses Bayesian Pareto framework from auto-calibration: task completion, cost efficiency, safety, tool utilization.
- Selection: top 4 survive, 2 mutations (add/remove one tool), 2 crossovers (combine two survivors' tool sets).
- Arena uses `createAgentCore()` — the arena IS an interface.
- Compute cost: ~$4.50 for 8 agents x 15 generations with Haiku (well within budget).
- Teaching/cooperation explicitly deferred — competitive selection only.

## Key Risks

- Degenerate equilibria (zero-tool agent scores high on safety, zero on completion)
- Task battery design bias toward current architecture
- Tool dependency graph must be explicit (from tool-packages milestone)
- Safety of evolved agents with unusual tool compositions (amygdala still runs first)

## Training Data Generated (Novel)

- Composition-fitness pairs (architecture search data)
- Tool utilization patterns per intent
- Failure modes by composition
- Emergent strategies under selection pressure

## Verification Gate

- [ ] `createArena()` factory with tournament execution
- [ ] Dependency-aware random tool composition sampling
- [ ] JSONL generation logs (compositions, scores, selections, mutations)
- [ ] CLI entrypoint: `npm run arena`
- [ ] Red-team: arena agents can't escape sandbox
- [ ] `GET /api/metrics/arena` endpoint
- [ ] ArenaHistory component (generation fitness chart)
- [ ] ToolFrequency component (which tools appear in winners)
- [ ] Pipeline exports composition-fitness pairs as training data
- [ ] Winning composition differs from hand-designed subagent configs

## Files

`packages/llm/src/calibration/{runner,fitness}.ts` (pattern + framework reuse), `packages/llm/src/subagent/registry.ts` (dynamic configs), `packages/llm/src/tool/index.ts` (dependency metadata)
