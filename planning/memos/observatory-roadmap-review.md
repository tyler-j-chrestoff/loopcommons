# Roadmap Review Request: Agent Observatory

## Context

Loop Commons is a live research platform testing the thesis that **an agent's identity is its tool composition, not its prompt.** The arena system evolves populations of agents with different tool sets across encounters (DevOps scenarios). Dead agents' traces are more informative than winners — they map the fitness landscape boundaries.

We've built 7 milestones proving progressively stronger claims (tools describe themselves → prompts derive from tools → memory is required → identity is portable → lineage is attested → path dependence is real → evolution discovers what hand-design can't).

The active milestone is **arena-platform** (co-evolving communities of agents, encounters, and evaluators). We just shipped the first 3 of 6 stories: SSE tournament streaming, an agent ToolPackage for querying arena state, and a YAML encounter DSL.

## The Problem

All tournament results currently live in JSONL files on disk. The only way to see them is terminal output or a single live-streaming page. A visitor to the site sees a "start tournament" button and nothing else. The per-agent per-encounter step traces (the actual tool calls — "inspect → result → inspect → gave up") are generated during execution but discarded by the task battery.

The founder's requirement: **a casual visitor from Twitter/HN should land on the site and immediately understand what's happening through the data itself — no explainer text, show don't tell.**

## Proposed Plan

Insert 5 sessions between the shipped infrastructure and the remaining scientific work:

| Session | Title | Lego | Ships standalone? |
|---------|-------|------|-------------------|
| 49 | Capture step traces | `executeEncounter` callback persists per-agent per-encounter JSONL traces to disk | Yes — data exists for all future work |
| 50 | Tournament browser | `/arena` shows latest tournament, past tournaments list, agent×encounter heatmap | Yes — visitors can see results |
| 51 | Encounter replay | Click heatmap cell → step-by-step tool call visualization with death highlighting | Yes — visitors can watch an agent think |
| 52 | The graveyard | Dead agents as first-class content, sorted by most interesting death, shareable cards | Yes — failure is the hero |
| 53 | Chat traces in observatory | Chat sessions appear alongside tournament traces, same replay component | Yes — every interaction observable |

Then the remaining arena-platform science resumes:

| Session | Title | Original plan |
|---------|-------|---------------|
| 54 | Encounter families + anchor protocol | Was session 49 |
| 55 | Community fitness + niche preservation | Was session 50 |
| 56 | Evaluator co-evolution + skeptic lineage | Was session 51 |

## Questions for Review

1. **Should the observatory be its own milestone?** It doesn't prove a new thesis claim — it makes existing claims inspectable. The current plan keeps it inside arena-platform, but it could be a separate milestone like "arena-observatory" between agent-arena and arena-platform's scientific stories.

2. **Is session 53 (chat traces in observatory) premature?** It unifies chat and tournament traces into one browsable format. But maybe the arena trace format needs to prove itself first before we force chat into the same shape. Should this be deferred to a suggestion?

3. **Should any observatory sessions run in parallel with co-evolution work?** Sessions 49-53 are pure UI/persistence — they don't touch the tournament engine. Sessions 54-56 are pure engine — they don't touch the UI. In theory they could interleave. But the founder prefers small sequential legos over parallel tracks. Is blocking the science for 5 sessions of UI the right call?

4. **Is the overall arc still coherent?** The roadmap went from "prove the thesis" to "make the proof visible" to "advance the thesis further." Does inserting an observability layer between proof and advancement strengthen or dilute the narrative?

## Architecture Notes

- `executeEncounter()` is the lowest-level execution function — all paths (tournament, roguelike, future) go through it
- Chat already persists full traces via `SessionWriter` (JSONL with tool calls, amygdala reasoning, judge scores)
- Tournament persistence writes `events.jsonl` + `generations.jsonl` per tournament
- The missing piece: per-agent per-encounter step traces (StepRecord[] with tool inputs/outputs) — currently generated then discarded
- No SQLite — native bindings break Next.js/Turbopack. JSONL is the pipeline interchange format (Dagster consolidates to Parquet downstream)
