# Milestone: Arena Platform

**Claim tested**: Co-evolving populations of agents, encounters, and evaluators produce a diverse community of specialists — and the community, not any individual, is the unit of evolution.

**Depends on**: agent-arena (evaluator redesign shipped in session 47)

**Design doc**: [arena-platform.md](../agent-arena/designs/arena-platform.md)

## Stories

1. [arena-realtime-api](stories/arena-realtime-api.md) — SSE tournament streaming + state query API (6 tasks)
2. [arena-agent-tools](stories/arena-agent-tools.md) — queryArena ToolPackage for agent observability (3 tasks)
3. [encounter-dsl](stories/encounter-dsl.md) — YAML encounter definitions, compiler to EncounterConfig (5 tasks)
4. [encounter-families](stories/encounter-families.md) — Surface variants, consistency scoring, anchor protocol (5 tasks)
5. [community-fitness](stories/community-fitness.md) — Selection for collective coverage, niche preservation, museum of failures (7 tasks)
6. [evaluator-coevolution](stories/evaluator-coevolution.md) — Evaluator genomes, skeptic lineage, collusion detection (8 tasks)

## Architecture

Six layers building on each other:
1. SSE streaming (wire existing onEvent to web endpoint)
2. Agent tooling (queryArena ToolPackage)
3. Encounter DSL (YAML → EncounterConfig compiler)
4. Encounter families + anchor protocol (surface variants, frozen validation)
5. Community fitness (niche-preserving selection, collective coverage)
6. Co-evolution + skeptic (three populations + adversarial anchor)

## Key Concepts

- **Fitness = fit**: not strength, but match between agent shape and environment shape
- **Community > individual**: selection optimizes for collective coverage, not best solo score
- **Anchor protocol**: frozen validation battery, content-hashed, never touched by co-evolution
- **Skeptic lineage**: adversarial population outside the fitness loop, rewarded for finding failures
- **Museum of beautiful failures**: dead lineage traces as primary training artifact
