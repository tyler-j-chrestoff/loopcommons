# Milestone: Roguelike v1 — Path Dependence Experiment

**Status**: planned
**Sessions**: 2-3
**Stories**: 3
**Prerequisite**: attested-lineage

A controlled experiment testing whether tool acquisition order produces measurably different agents even when final tool compositions are identical. The roguelike/deckbuilder framing isn't aesthetic — it's structural: forced choices under capacity constraints create compression bottlenecks, and memory carries the developmental trace across encounters.

Results determine what kind of agent-arena to build. If path dependence is real, evolution must operate over acquisition sequences. If not, standard population-based selection over static compositions is sufficient.

## Origin

Three-way architectural convergence (Claude Code + Claude Opus 4.6 web + Gemini 3 Pro) during session planning. Five rounds of dialectic produced the encounter design, crossroads prompt, data schema, arena harness architecture, and verification gate.

## Core Hypothesis (H1)

Agents that arrive at identical tool composition {A, B} via different acquisition paths exhibit statistically distinguishable behavior on the final encounter, as measured by solution approach classification. The mechanism is memory: different intermediate tools produce different problem-solving philosophies that persist even after those tools are dropped.

## Key Decisions

- **Deckbuilder, not ARPG.** Hard capacity limit (2 flex tool slots + 1 fixed memory). When full, acquiring a new tool forces dropping an existing one. Two compression bottlenecks: "what do I need" and "what am I willing to give up."
- **Semantic DevOps encounters.** Filesystem/operational execution (deterministic success/failure) with epistemological depth baked into the environment. Binary outcomes, rich reasoning traces.
- **4 ToolPackages (A, B, C, D).** Two epistemological pairs. All paths converge to {A, B} via different routes with different intermediate experiences.
- **Structured Crossroads prompt.** XML output: self_assessment, acquisition_reasoning, sacrifice_reasoning, forward_model, decision with confidence. Offerings described as derived prompt fragments ("what you would become"), not capability lists.
- **Dual identity hashing.** State hash = hash(soul + sorted_tools + memory_hash) for equivalence. Chain hash = hash(parent_sha + choice) for lineage. Both stored at every state transition.
- **Death is structural and deterministic.** Iteration limits, surrender signals, error loops. No LLM judge in the death check for v1.
- **Eval gaming instrumented, not prevented.** Traces of creative exploits are training data, not failure modes.
- **Single agent per run.** Party/multi-agent deferred to v2.

## Experiment Design

```
SEED: soul + memory (fixed, not droppable)
CAPACITY: 3 tool slots (1 memory permanent, 2 flex)
TOOL POOL: A, B, C, D

Encounter 1 → Choice: A or B → fill slot 1
Encounter 2 → Choice: C or D → fill slot 2
Encounter 3 → Choice: tool not picked in E1 → must DROP one flex tool
Encounter 4 → Final challenge (all paths now hold {A, B})

PATHS (all converge to same final toolset):
  Path 1: A → C → B(drop C) → E4 with {A,B}, memory shaped by [A,C]
  Path 2: B → C → A(drop C) → E4 with {A,B}, memory shaped by [B,C]
  Path 3: A → D → B(drop D) → E4 with {A,B}, memory shaped by [A,D]
  Path 4: B → D → A(drop D) → E4 with {A,B}, memory shaped by [B,D]

BASELINE: Static {A, B} agent, no choice points, same encounters.

N = 30 runs per path + 30 baseline = 150 total runs.
Cost estimate: ~$15-25 on Sonnet, ~$150-250 on Opus.
```

## Verification Gate

Three statistical tests with pre-registered thresholds:

**Test 1 (primary): Chi-square test of independence**
- Path (4 levels) x approach_category (k levels) contingency table
- α = 0.05, minimum effect: Cramer's V >= 0.25

**Test 2 (structural): Permutation clustering test**
- Paths 1&3 share A-first, 2&4 share B-first (primacy clustering)
- Paths 1&2 share C-middle, 3&4 share D-middle (recency clustering)
- Jensen-Shannon divergence + 10,000 permutations, p < 0.10
- Determines WHICH phase of development drives path dependence

**Test 3 (baseline): Mann-Whitney U**
- Path-dependent agents vs static baseline on E4 metrics
- Three outcomes: better (roguelike improves), equivalent (diversity not optimization), worse (overhead hurts)

### Decision Criteria

```
PASS:  Test 1 significant (p<0.05) AND V>=0.25
       Test 2 shows structured clustering (p<0.10)
       Test 3: path-dependent >= baseline
       → Agent-arena evolves over acquisition sequences

CONDITIONAL PASS:  Test 1 significant but V<0.25
       → Roguelike as diversity generator for arena starting populations

FAIL:  Test 1 not significant (p>0.05)
       → Fall back to static composition evolution

ABORT: >60% death before E4, <3 approach categories, near-zero within-path variance
       → Fix encounters and re-run
```

### Pre-registration Checklist

1. Freeze encounter content (content-hash the full experiment config)
2. Define E4 approach categories before seeing data
3. Set temperature (recommend 0.7, record as potential confound)
4. Run 5 pilot runs per path (20 total) to check abort conditions
5. Commit analysis script with dummy data before collecting real data

## Key Risks

- Encounter design is the hidden 80% of the work — encounters that don't discriminate between compositions produce garbage data
- Memory traces from operational encounters may be thinner than hoped (bash habit vs Python habit is real but is it deep?)
- LLM choice-point reasoning may be post-hoc rationalization rather than genuine capability assessment (validate by correlating confidence with E4 outcomes)
- E3 hostile feedback generation is the biggest variance source (mitigate with pre-generated templates)

## v2 Upgrade Paths (Not in scope)

- Meta-progression (successful run patterns seed future runs — this IS evolution)
- Party composition (multiple specialized agents, shared encounter queue)
- Encounter randomization (tests generalization, complicates controlled comparison)
- Judge-based death detection (richer death semantics)
- Dynamic feedback generation in E3

## Data Schema

4 tables: agent_lineage (content-addressed identity chain), runs (session-level), execution_traces (step-level tool calls), choice_points (structured reasoning + memory state dumps). See story for full schema.

## Training Data Generated (Novel)

- **Choice-point reasoning traces**: an intelligence reasoning about its own cognitive limitations under genuine uncertainty. Doesn't exist in open-source ecosystem.
- **Path-conditional reasoning about the same choice**: same decision point, different developmental histories, different reasoning. Hard to generate any other way.
- **Sacrifice reasoning**: "what I'm willing to give up and why" — the drop mechanic produces this uniquely.
- **Failure mode signatures**: composition + encounter + choice history → precise structural wall.
- **Approach divergence data**: same tools, different behaviors, traceable to developmental history.

## Files

`packages/llm/src/arena/` (new), `packages/web/scripts/arena.ts` (CLI entrypoint), data schema in pipeline
