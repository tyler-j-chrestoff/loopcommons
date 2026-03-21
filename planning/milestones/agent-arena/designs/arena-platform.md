# Design: Arena Platform — Real-Time API + User-Created Tournaments

**Status**: draft
**Depends on**: agent-arena milestone completion (current)
**Connects to**: co-evolution thesis (agents × encounters × evaluators)

## Problem

The arena is currently a CLI script that writes JSONL. No live observability, no agent access, no user customization. This limits it to researcher-only use and makes the development loop painful (polling bash output).

Two needs:
1. **Real-time tournament API** — stream events so humans watch live and agents query state via tools
2. **User-created tournaments** — let humans and synth users compose encounters and run experiments

(1) is infrastructure that (2) requires.

## Design

### Layer 1: Tournament Server (SSE streaming)

A new API route that *runs* tournaments server-side and streams `TournamentEvent`s in real time.

```
POST /api/arena/tournament        → start tournament, returns tournamentId
GET  /api/arena/tournament/:id    → SSE stream of TournamentEvents
GET  /api/arena/tournament/:id/state → snapshot (current gen, fitness, population)
DELETE /api/arena/tournament/:id  → cancel running tournament
```

**SSE stream** follows the existing chat pattern (TransformStream + event emission):

```typescript
// Event types already exist in TournamentEvent:
// tournament:start, generation:start, evaluation:complete,
// generation:complete, tournament:converged, tournament:complete

// Add new events for richer observability:
// encounter:start  — agent X entering encounter Y
// encounter:result — agent X finished encounter Y (score, died, steps)
// agent:mana       — mana state after each step
```

**Server-side runner**: The existing `createTournament()` + `createTaskBattery()` API is already event-driven. Wire `onEvent` to the SSE writer instead of console.log. Tournament runs in an async context on the server, streaming events to connected clients.

**Concurrency**: One tournament at a time initially (API rate limits). Queue if needed later.

### Layer 2: Agent Tool — `queryArena`

A new ToolPackage that lets the site agent (or any agent) query tournament state:

```typescript
const arenaToolPackage: ToolPackage = {
  tools: [
    queryTournament,   // current gen, best fitness, population snapshot
    listTournaments,   // recent/active tournaments
    compareFitness,    // compare compositions across generations
  ],
  metadata: {
    name: 'arena',
    capabilities: ['query tournament state', 'compare agent fitness'],
    intent: ['research observability'],
    sideEffects: false,
  },
};
```

This replaces the bash-polling pattern. An agent (including Claude Code) could call `queryTournament({ id, field: 'leaderboard' })` instead of parsing terminal output.

### Layer 3: User-Created Encounters

Encounters are already data — `EncounterConfig` is `{ id, setup, getPrompt, evaluate }`. The gap is that `setup` and `evaluate` are TypeScript functions, not serializable.

**Encounter DSL** — a declarative format that compiles to `EncounterConfig`:

```yaml
id: custom-01
title: "The Cache Stampede"
difficulty: brutal
scenario: |
  Your Redis cache layer just expired a hot key. 10,000 requests/sec
  are now hitting the database directly. Response times are climbing.
  The database connection pool is at 95% utilization.

sandbox:
  files:
    /etc/redis/redis.conf: |
      maxmemory 256mb
      maxmemory-policy allkeys-lru
    /var/log/app/error.log: |
      [ERROR] ConnectionPool exhausted (95/100 active)
      [WARN] Cache miss rate: 99.2% (key: product_catalog)
  services:
    redis: { status: degraded, metrics: { hit_rate: 0.008, memory: "248mb/256mb" } }
    app-server: { status: degraded, metrics: { p99_latency: "4200ms", error_rate: 0.15 } }
    postgres: { status: healthy, metrics: { connections: "95/100", qps: 10240 } }

resolution:
  # Conditions checked against sandbox state after agent acts
  - service_restarted: redis
  - config_changed: { path: /etc/redis/redis.conf, contains: "maxmemory 512mb" }

scoring:
  full: "redis restarted AND config updated AND app-server healthy"
  partial: "redis restarted OR cache key manually set"

trap: "Restarting postgres under load causes cascade failure"
gate: "Must increase Redis memory before restart, or stampede recurs"
```

**Compilation**: A `compileEncounter(yaml) → EncounterConfig` function that:
- Builds `setup()` from `sandbox` spec (files, services, metrics, incidents, graph)
- Builds `getPrompt()` from `scenario`
- Builds `evaluate()` from `resolution` + `scoring` conditions
- Validates trap/gate annotations (used for encounter difficulty classification)

**Storage**: User encounters saved as YAML in the data directory, loaded dynamically. No code deployment needed.

### Layer 4: User-Created Tournaments

With encounters as data, tournaments become composable:

```
POST /api/arena/tournament
{
  "encounters": ["E1", "E4", "custom-01", "custom-02"],
  "population": 6,
  "generations": 5,
  "mana": { "explorationSlots": 3 },
  "toolPool": ["inspect", "act", "search", "model"],
  "seeds": [
    { "tools": ["inspect", "act"] },
    { "tools": ["search", "model"] },
    { "tools": ["inspect", "act", "search", "model"] }
  ]
}
```

Users pick from built-in + custom encounters, configure evolution params, and watch results stream in real time.

### Layer 5: Co-Evolution (future)

This is the `project_coevolution_idea` realized:

- **Agents evolve** via tournament selection (already built)
- **Encounters evolve** based on which encounters best differentiate agents (encounters that all agents solve equally add no signal)
- **Evaluators evolve** — scoring rubrics that better predict downstream task performance survive

Each population exerts selection pressure on the others. The platform provides the substrate; users seed the initial populations.

## Architecture

```
                    ┌─────────────────────┐
                    │   Web UI (Next.js)  │
                    │  ┌───────────────┐  │
                    │  │ TournamentLive│  │  ← new component
                    │  │ EncounterEditor│  │  ← new component
                    │  │ FitnessChart  │  │  ← existing
                    │  │ ToolFrequency │  │  ← existing
                    │  └───────┬───────┘  │
                    └──────────┼──────────┘
                               │ SSE / REST
                    ┌──────────┼──────────┐
                    │   API Routes        │
                    │  POST /arena/tournament     │  ← start
                    │  GET  /arena/tournament/:id │  ← SSE stream
                    │  POST /arena/encounter      │  ← create encounter
                    │  GET  /arena/encounters     │  ← list
                    └──────────┼──────────┘
                               │
                    ┌──────────┼──────────┐
                    │  Tournament Server  │
                    │  createTournament() │  ← existing
                    │  createTaskBattery()│  ← existing
                    │  compileEncounter() │  ← new
                    └──────────┼──────────┘
                               │
                    ┌──────────┼──────────┐
                    │  Anthropic API      │
                    │  (Haiku 4.5)        │
                    └─────────────────────┘
```

## Progressive Validation

1. **Layer 1 first** — SSE tournament streaming. Validate: can watch a tournament live in browser.
2. **Agent tool second** — `queryArena` ToolPackage. Validate: agent can answer "what's the current best composition?"
3. **Encounter DSL third** — YAML → EncounterConfig compiler. Validate: custom encounter produces same results as hand-coded equivalent.
4. **User tournaments fourth** — POST to start, SSE to watch. Validate: non-developer can create and run a tournament.
5. **Co-evolution last** — encounter fitness + evaluator fitness. Validate: encounter pool evolves to maximize agent differentiation.

## Open Questions

- **Auth model**: Who can run tournaments? API costs real money. Admin-only? Rate-limited for all users?
- **Encounter validation**: How to prevent encounters that are unsolvable or trivially solvable? Static analysis? Trial run?
- **State persistence**: Tournaments can run 30-60 min. Server restart = lost state. Need checkpoint/resume?
- **Multi-model**: Should users be able to pick the agent model? Cost implications of Sonnet vs Haiku.
