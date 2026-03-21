# Milestone: Arena Platform

**Claim tested**: A research platform where humans and agents compose encounters, run tournaments, and watch evolution in real time produces richer fitness landscapes than hand-designed experiments.

**Depends on**: agent-arena (evaluator redesign must ship first)

**Design doc**: [arena-platform.md](../agent-arena/designs/arena-platform.md)

## Stories

1. [arena-realtime-api](stories/arena-realtime-api.md) — SSE tournament streaming + state query API
2. [arena-agent-tools](stories/arena-agent-tools.md) — queryArena ToolPackage for agent observability
3. [encounter-dsl](stories/encounter-dsl.md) — YAML encounter definitions, compiler to EncounterConfig
4. [encounter-families](stories/encounter-families.md) — Surface variants, consistency scoring, transfer pressure
5. [evaluator-coevolution](stories/evaluator-coevolution.md) — Evaluator genomes, meta-fitness = composition variance

## Architecture

See design doc. Five layers building on each other:
1. SSE streaming (wire existing onEvent to web endpoint)
2. Agent tooling (queryArena ToolPackage)
3. Encounter DSL (YAML → EncounterConfig compiler)
4. User-created tournaments (POST config, SSE to watch)
5. Co-evolution (encounter + evaluator populations)
