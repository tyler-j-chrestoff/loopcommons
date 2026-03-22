# Story: Tournament Browser

**Persona**: As a visitor who just found the site from Twitter, I need to immediately see tournament results — agents competing, some winning, some dying — so I understand what this platform does without reading anything.

**Status**: done

**Context**: The current `/arena` page leads with a "start tournament" button. A visitor doesn't want to run anything — they want to see what already happened. The page needs to flip: results first, controls behind auth.

**Acceptance criteria**:
- `/arena` landing shows the latest completed tournament front and center
- Agent × encounter heatmap: rows = agents (sorted by fitness), columns = encounters, cells colored by score
- Featured Death card: auto-selected most interesting dead agent with one-line epitaph
- Past tournaments list below (click to explore any)
- "Start Tournament" moves behind auth in nav
- All data read from persisted JSONL (works after server restart)
- Responsive — works on mobile (people browse Twitter links on phones)

## Tasks

```jsonl
{"id":"tb-01","title":"Research: tournament data loader from JSONL","type":"research","status":"done","description":"Design API for loading tournament data from data/arena/tournaments/{id}/ directories. List tournaments, load generations.jsonl, load traces. Consider caching strategy for repeated reads.","estimate":"20min","deps":[],"prereqs":[]}
{"id":"tb-02","title":"GET /api/arena/tournaments list endpoint","type":"implementation","status":"done","description":"List all past tournaments from disk. Return id, date, generationCount, bestFitness, winnerTools, agentCount for each. Sorted by most recent.","estimate":"25min","deps":["tb-01"],"prereqs":[]}
{"id":"tb-03","title":"GET /api/arena/tournaments/:id detail endpoint","type":"implementation","status":"done","description":"Return full tournament detail: all generations with population, fitness (including taskResults), mutations, crossovers. Read from generations.jsonl on disk.","estimate":"25min","deps":["tb-01"],"prereqs":[]}
{"id":"tb-04","title":"Redesign /arena page: results-first layout","type":"implementation","status":"done","description":"Latest tournament heatmap front and center. Featured Death card. Past tournaments list. Start button behind auth. No explainer text — the data is the explanation.","estimate":"45min","deps":["tb-02","tb-03"],"prereqs":[]}
{"id":"tb-05","title":"Agent × encounter heatmap component","type":"implementation","status":"done","description":"Table component: rows = agents (tool badges + fitness), columns = encounters, cells colored green/yellow/orange/red by score. Sorted by fitness descending. Clickable cells (wired to replay in next story). Mobile-responsive.","estimate":"35min","deps":["tb-03"],"prereqs":[]}
{"id":"tb-06","title":"Featured Death card component","type":"implementation","status":"done","description":"Auto-select most interesting death: highest (trace length × (1 - score)). Show agent tools, encounter name, one-line epitaph derived from death cause and tool composition. Prominent placement on landing.","estimate":"25min","deps":["tb-03"],"prereqs":[]}
{"id":"tb-07","title":"Tests for tournament browser","type":"test","status":"done","description":"TDD: list endpoint returns tournaments from disk, detail endpoint returns full data, heatmap renders with correct colors, featured death selects interesting agent, page works with zero tournaments (empty state).","estimate":"30min","deps":["tb-02","tb-03","tb-04","tb-05","tb-06"],"prereqs":[]}
```
