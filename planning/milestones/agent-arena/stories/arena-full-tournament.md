# Story: Full Tournament Run + Thesis Validation

**Persona**: As a researcher, I need to run the tournament at scale with the mana system, analyze whether tool composition drives fitness differentiation, and determine if the agent-arena milestone is complete.

**Status**: done

**Context**: Sessions 43-45 built the tournament system, brutal encounters, mana phase-gating, done tool, and toolChoice:required. Lego validations (1-3) confirmed fitness differentiation at small scale. This story scales up: 8 agents, 5+ generations, mana enabled, full encounter pool. If differentiation holds and evolution discovers compositions that hand-design didn't predict, the thesis is validated.

**Acceptance criteria**:
- Full tournament completes (8 agents, 5+ generations, mana enabled)
- Winning composition differs from initial seeds (evolution did something)
- Fitness differentiation is statistically meaningful (not noise)
- Results documented with analysis
- If thesis validated: milestone status updated, retro written

## Tasks

```jsonl
{"id":"ft-01","title":"Wire mana config into tournament script","type":"implementation","status":"done","description":"Update arena-tournament.ts to pass manaConfig (3 exploration slots, inspect/search/model cost 1, act/done cost 0) to task battery and tournament config. This was shipped in session 45 but not wired into the script.","estimate":"15min","deps":[],"prereqs":[]}
{"id":"ft-02","title":"Run pilot tournament (4 agents, 3 gens, mana)","type":"test","status":"done","description":"Run --pilot with live agents + mana to verify full pipeline works end-to-end before scaling up. Smoke test: completes without error, JSONL written, fitness scores non-trivial.","estimate":"10min","deps":["ft-01"],"prereqs":["ANTHROPIC_API_KEY"]}
{"id":"ft-03","title":"Run full tournament (8 agents, 5+ gens, mana)","type":"test","status":"done","description":"Full scale run. 8 diverse seed compositions, 6 encounters (4 roguelike + 1 brutal + 1 generalization), mana-gated exploration. Observe convergence behavior.","estimate":"30min","deps":["ft-02"],"prereqs":["ANTHROPIC_API_KEY"]}
{"id":"ft-04","title":"Results analysis + thesis verification","type":"analysis","status":"done","description":"Analyze tournament output: (1) Did winning composition differ from seeds? (2) Did fitness differentiate meaningfully across compositions? (3) Did evolution discover non-obvious compositions? (4) Did mana system force meaningful action? Document findings.","estimate":"30min","deps":["ft-03"],"prereqs":[]}
{"id":"ft-05","title":"Milestone wrap-up","type":"documentation","status":"done","description":"If thesis validated: update milestone status, write session retro, update ROADMAP.md. If not: document what failed and what the next experiment should be.","estimate":"15min","deps":["ft-04"],"prereqs":[]}
```
