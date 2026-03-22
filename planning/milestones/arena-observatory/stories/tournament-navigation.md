# Story: Tournament Navigation

**Persona**: As a visitor browsing from a shared link, I need each tournament to have its own URL so I can bookmark it, share it, and use browser back/forward to navigate between tournaments — not get dumped back to "latest" on every page load.

**Status**: planned

**Context**: The current `/arena` page is a monolithic single-page app. Tournament selection swaps state in-place without changing the URL. This breaks shareability, browser navigation, and discoverability. With co-evolution sessions (55-57) approaching, the number of tournaments will grow from "a handful" to dozens. The navigation model must scale.

**Route structure**:
```
/arena                                    → latest tournament hero + tournament list
/arena/tournaments                        → full tournament list (scales to dozens)
/arena/[id]                               → tournament detail (heatmap, deaths, stats)
/arena/[id]/live                          → live streaming view during a run
/arena/[id]/[agentId]/[encounterId]       → encounter replay (exists, needs reparenting)
```

**Key design decisions**:
- `/arena` keeps results-first landing (latest tournament heatmap as hero) but adds a visible tournament list
- Each tournament gets a permalink via `/arena/[id]`
- Graveyard stays cross-tournament on `/arena` (below hero) until it needs its own route
- Live tournament view moves from page-level state hijack to `/arena/[id]/live`
- Existing replay route `/arena/[tournamentId]/[agentId]/[encounterId]` restructured to `/arena/[id]/[agentId]/[encounterId]`

**Acceptance criteria**:
- Every tournament has a shareable URL (`/arena/[id]`)
- Browser back/forward works between tournament views
- `/arena` shows latest tournament + navigable list of past tournaments
- `/arena/tournaments` shows full list when collection grows
- Live tournament accessible at `/arena/[id]/live` with SSE streaming
- Encounter replay still works at new route structure
- Mobile responsive
- No regression in existing functionality (heatmap, deaths, graveyard)

## Tasks

```jsonl
{"id":"tn-01","title":"Research: Next.js App Router nested layouts for arena routes","type":"research","status":"planned","description":"Design the layout/page hierarchy for /arena, /arena/tournaments, /arena/[id], /arena/[id]/live, /arena/[id]/[agentId]/[encounterId]. Determine what state lives in layout vs page. Plan migration from current single-page to route-based navigation without breaking existing links.","estimate":"20min","deps":[],"prereqs":[]}
{"id":"tn-02","title":"Tournament detail page: /arena/[id]","type":"implementation","status":"planned","description":"New route that renders tournament detail by ID: heatmap, featured death, stats. Extract current detail rendering from monolithic /arena page into reusable component. This page IS the permalink for a tournament.","estimate":"35min","deps":["tn-01"],"prereqs":[]}
{"id":"tn-03","title":"Tournament list component + /arena/tournaments route","type":"implementation","status":"planned","description":"Card/grid list of all tournaments. Each card shows: date, generation count, agent count, best fitness, winner tools. Click navigates to /arena/[id]. Used both on /arena (compact, below hero) and /arena/tournaments (full page).","estimate":"30min","deps":["tn-01"],"prereqs":[]}
{"id":"tn-04","title":"Refactor /arena landing: latest hero + list","type":"implementation","status":"planned","description":"Rework /arena page to show latest tournament detail as hero (reusing tn-02 component) plus tournament list below (reusing tn-03 component). Replace in-place state swapping with links to /arena/[id].","estimate":"25min","deps":["tn-02","tn-03"],"prereqs":[]}
{"id":"tn-05","title":"Live tournament route: /arena/[id]/live","type":"implementation","status":"planned","description":"Move TournamentLive component from page-level state hijack to dedicated route. SSE streaming, fitness charts, population grid, event log. Redirect to /arena/[id] when tournament completes.","estimate":"25min","deps":["tn-02"],"prereqs":[]}
{"id":"tn-06","title":"Migrate replay route to /arena/[id]/[agentId]/[encounterId]","type":"implementation","status":"planned","description":"Restructure existing replay route from /arena/[tournamentId]/[agentId]/[encounterId] to /arena/[id]/[agentId]/[encounterId]. Update all internal links (heatmap cell clicks, death card links, back navigation). Ensure old URLs redirect or still work.","estimate":"20min","deps":["tn-02"],"prereqs":[]}
{"id":"tn-07","title":"Tests for tournament navigation","type":"test","status":"planned","description":"TDD: tournament detail page renders by ID, list shows all tournaments, /arena shows latest + list, live route streams events, replay works at new path, browser navigation between tournaments works, mobile responsive, empty states.","estimate":"30min","deps":["tn-02","tn-03","tn-04","tn-05","tn-06"],"prereqs":[]}
```
