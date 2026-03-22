# Story: Real-Time Tournament API

**Persona**: As a researcher, I need to watch tournaments evolve in real time through the browser, so I can observe dynamics as they happen instead of parsing terminal output after the fact.

**Status**: planned

**Context**: The tournament runner already emits `TournamentEvent`s via `onEvent`. Wire this to an SSE endpoint so the web UI can stream live events. Add state query endpoints for snapshots.

**Acceptance criteria**:
- POST endpoint starts a tournament, returns tournamentId
- GET endpoint streams TournamentEvents via SSE
- State snapshot endpoint returns current generation, fitness, population
- Web component renders live tournament progress
- One tournament at a time (queue or reject concurrent requests)

## Tasks

```jsonl
{"id":"rt-01","title":"Research: SSE patterns in existing codebase","type":"research","status":"planned","description":"Audit existing SSE usage in route.ts chat endpoint. Identify patterns to reuse for tournament streaming. Check Railway SSE limits.","estimate":"15min","deps":[],"prereqs":[]}
{"id":"rt-02","title":"POST /api/arena/tournament endpoint","type":"implementation","status":"planned","description":"API route that accepts TournamentConfig, starts tournament in async context, returns tournamentId. Guard with admin auth. One-at-a-time concurrency.","estimate":"30min","deps":["rt-01"],"prereqs":[]}
{"id":"rt-03","title":"GET /api/arena/tournament/:id SSE stream","type":"implementation","status":"planned","description":"Stream TournamentEvents to connected clients. Wire existing onEvent callback to SSE writer. Add encounter:start and encounter:result event types for finer granularity.","estimate":"30min","deps":["rt-02"],"prereqs":[]}
{"id":"rt-04","title":"GET /api/arena/tournament/:id/state snapshot","type":"implementation","status":"planned","description":"Return current generation, population, fitness leaderboard, mana state as JSON snapshot.","estimate":"20min","deps":["rt-02"],"prereqs":[]}
{"id":"rt-05","title":"TournamentLive web component","type":"implementation","status":"planned","description":"React component that connects to SSE stream and renders: generation progress, fitness chart (reuse existing), population composition, per-encounter results grid.","estimate":"45min","deps":["rt-03","rt-04"],"prereqs":[]}
{"id":"rt-06","title":"Tests for tournament API","type":"test","status":"planned","description":"TDD: endpoint auth, SSE event format, state snapshot shape, concurrent request rejection, tournament lifecycle (start → stream → complete).","estimate":"30min","deps":["rt-02","rt-03","rt-04"],"prereqs":[]}
```
