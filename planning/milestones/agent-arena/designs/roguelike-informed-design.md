# Design: Agent Arena Informed by Roguelike v1 Results

**Status**: Draft — informs session 42+ planning

## Gate Result: CONDITIONAL PASS

Roguelike v1 pilot (25 runs, 5 per path + 5 baseline) found:

**What worked:**
- Path dependence is real but **manifests as survival rate and tool diversity, not approach category distribution**
- Act-first agents die 40% at E1 (vs 0% for inspect-first and baseline)
- Search-first agents produce the most diverse E4 behavior
- Model-first agents are most efficient (20% fewer steps to same outcomes)
- Inspect-first is indistinguishable from baseline (the "safe" choice has no developmental effect)
- Crossroads reasoning captures genuine self-assessment under uncertainty

**What didn't work:**
- Chi-square on approach categories: insufficient signal (categories too coarse, or effect smaller than V=0.25)
- System prompt bias initially overwhelmed path-dependence signal (fixed in pilot iteration)
- E4 approach classifier threshold was miscalibrated for actual step counts

**Implication for arena:** Path dependence is a **diversity generator**, not an optimization mechanism. The roguelike doesn't produce "better" agents — it produces agents with different developmental histories that lead to different failure modes and different strengths. This is exactly what a starting population for evolution needs.

## Revised Arena Architecture

### Population Seeding via Roguelike

Instead of random tool composition sampling (original design), seed the initial population with roguelike graduates:

```
GENERATION 0:
  Run roguelike with N paths × M trials
  Select survivors (completed all encounters)
  Each survivor carries:
    - Final tool composition (same for convergent paths)
    - Memory state (different per developmental history)
    - Lineage chain (content-addressed identity hash)
    - Choice-point reasoning traces (training data)

  Initial population = diverse survivors, NOT random compositions
```

**Why this is better than random seeding:**
1. Survivors have proven they can handle encounters — no wasted compute on unviable compositions
2. Memory state carries developmental context — agents aren't just tool sets, they're agents with histories
3. Lineage hashing is already implemented (session 38b) — arena inherits it
4. The roguelike IS the population initialization mechanism, not a separate experiment

### Two-Phase Evolution

**Phase 1: Roguelike seeding (existing infrastructure)**
- 4 convergent paths × 10 trials = 40 roguelike runs
- ~20-30 survivors become generation 0
- Cost: ~$5 on Haiku

**Phase 2: Tournament selection (new)**
- 8 agents selected from generation 0 (2 per path to ensure diversity)
- Task battery: the 4 encounters from roguelike + 2-3 new generalization tasks
- Fitness: Bayesian Pareto (task completion, cost efficiency, tool utilization, memory quality)
- Selection: top 4 survive
- Mutation: swap one tool from pool (± 1 tool, respecting capacity)
- Crossover: combine memory states from two survivors (hippocampal merge)
- 10-15 generations
- Cost: ~$4-5 on Haiku

### Memory as the Evolutionary Substrate

The key insight from roguelike: **path dependence lives in memory, not in tool composition.** Two agents with {inspect, search} behave differently because their memories encode different problem-solving strategies. Evolution should therefore operate on memory + tools, not tools alone.

This means:
- Mutation changes tools (add/remove/swap) — changing what the agent CAN do
- Crossover merges memories (hippocampal consolidation between two agents) — changing what the agent KNOWS
- The `MemoryContract` from session 36 already supports consolidation triggers
- The `NullMemory` strategy serves as the "no developmental history" control

### Architecture Reuse

Everything needed already exists:
- `createAgentCore()` — arena IS an interface
- `createArenaRun()` + encounters — roguelike seeding
- `ArenaTraceWriter` — trace persistence
- `computeIdentity()` + `buildLineageRecord()` — identity tracking
- `MemoryContract.consolidate()` — memory merging
- Bayesian Pareto fitness from `src/calibration/fitness.ts`

**New infrastructure needed:**
1. Tournament runner (takes population, runs task battery, computes fitness, selects/mutates)
2. Memory crossover (merge two PersistentState instances via consolidation)
3. Task battery (extend encounter set with generalization tasks)
4. Population manager (tracks generations, lineage, fitness history)

### Training Data Generated

All roguelike training data (reasoning pairs, divergence pairs) PLUS:
- **Composition-fitness curves** (how fitness changes as tools are swapped across generations)
- **Memory merge outcomes** (what happens when two agents' memories are combined)
- **Evolutionary trajectories** (sequences of composition changes that improve/degrade fitness)
- **Emergent specialization** (do agents evolve toward ecological niches in the task space?)

## Updated Stories

The existing arena-infrastructure.md and arena-evaluation-viz.md stories need revision. Key changes:
- Replace random seeding with roguelike-based seeding
- Add memory crossover mechanism
- Extend task battery beyond roguelike encounters
- Reuse arena metrics API (rl-13) and viz components (rl-14 through rl-16)

## Open Questions

1. **Memory merge strategy**: Simple concatenation + consolidation? Weighted by fitness? Only merge "successful" memories?
2. **Generalization tasks**: Do we need encounters the population has never seen? (Tests whether evolved agents generalize vs overfit to the training encounters)
3. **Population size**: 8 is small. Can we afford 16 with Haiku? (~$8-10)
4. **Stopping criterion**: Fixed generations, or convergence-based (fitness plateau)?
5. **Full 150-run roguelike**: Should we run the full pre-registered experiment before arena, or is the 25-run pilot sufficient for seeding?
