# Story: The Graveyard

**Persona**: As a visitor, I need dead agents surfaced as the most interesting content on the site, so I understand that failure maps the landscape and the dead tell us more than the winners.

**Status**: planned

**Context**: "Museum of beautiful failures" — dead lineage traces contain more information about the fitness landscape than the winner. The graveyard is where the shareable, tweetable moments live. A death card with a one-line epitaph and a link to the replay is the thing that gets screenshotted and posted.

**Acceptance criteria**:
- Graveyard section on /arena showing dead agents across all tournaments
- Sorted by "interestingness": longest trace × lowest score × unique failure mode
- Each dead agent has an epitaph derived from its trace (e.g., "Had [inspect, model]. Couldn't act on what it knew.")
- Death cards: screenshot-friendly, contain tools, encounter, epitaph, score, link to replay
- Featured Death of the Day on landing page (rotates or auto-selects)
- Dead agents from different tournaments are comparable

## Tasks

```jsonl
{"id":"gy-01","title":"Research: death interestingness scoring","type":"research","status":"planned","description":"Define interestingness metric for dead agents. Candidates: trace length × (1 - score), tool-call entropy, unique failure mode (death cause rarity across population). Test against existing tournament data.","estimate":"20min","deps":[],"prereqs":["step-traces story complete"]}
{"id":"gy-02","title":"Epitaph generator","type":"implementation","status":"planned","description":"Function that takes agent tools, death cause, encounter name, and step summary → produces a one-line epitaph. Deterministic, no LLM call. Template-based: '[tools]. [what happened]. [why it matters]'.","estimate":"25min","deps":["gy-01"],"prereqs":[]}
{"id":"gy-03","title":"GET /api/arena/graveyard endpoint","type":"implementation","status":"planned","description":"Aggregate dead agents across all tournaments. Return sorted by interestingness. Each entry: agentId, tournamentId, tools, encounterId, deathCause, epitaph, score, traceLength. Paginated.","estimate":"30min","deps":["gy-01","gy-02"],"prereqs":[]}
{"id":"gy-04","title":"Graveyard section + death card component","type":"implementation","status":"planned","description":"Grid/list of death cards on /arena. Each card: tool badges, encounter name, epitaph, score bar, click-to-replay link. Featured Death card prominent at top. Mobile-friendly, screenshot-friendly.","estimate":"35min","deps":["gy-03"],"prereqs":[]}
{"id":"gy-05","title":"Tests for graveyard","type":"test","status":"planned","description":"TDD: interestingness sorting is correct, epitaph generation covers all death causes, graveyard endpoint aggregates across tournaments, death cards render correctly, empty state handled.","estimate":"25min","deps":["gy-02","gy-03","gy-04"],"prereqs":[]}
```
