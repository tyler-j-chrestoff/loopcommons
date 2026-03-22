# Story: Community Fitness — Selection for Collective Coverage

**Persona**: As a researcher, I need evolution to produce a diverse community of specialists rather than copies of one winner, so the population covers the full encounter space and the unit of evolution is the community, not the individual.

**Status**: planned

**Context**: Session 47 tournament converged to 7/8 agents as [act, search, model] by Gen 3 — a monoculture. Individual fitness selection drives convergence to one dominant composition. Community fitness adds selection pressure for collective coverage: agents that solve encounters no other agent solves are more valuable, even if their individual score is lower. The tournament "winner" becomes the population snapshot, not a single agent.

**Acceptance criteria**:
- Fitness is two-dimensional: individual score + marginal contribution to collective coverage
- Selection preserves niches: best specialist for each encounter cluster survives even with low individual fitness
- Population health metric: collective coverage (fraction of encounters solved by at least one agent)
- Diversity pressure: redundant compositions penalized, unique solvers rewarded
- Museum of beautiful failures: dead lineage traces exported as primary training artifact
- Tournament output is the community composition, not a single winner

## Tasks

```jsonl
{"id":"cf-01","title":"Research: quality-diversity algorithms","type":"research","status":"planned","description":"Survey MAP-Elites, novelty search, and related QD algorithms. Identify minimal mechanism for niche preservation that integrates with existing tournament runner. Key question: how to define behavioral niches in encounter-score space.","estimate":"30min","deps":[],"prereqs":[]}
{"id":"cf-02","title":"Marginal contribution metric","type":"implementation","status":"planned","description":"For each agent in the population, compute marginal contribution: how many encounters does this agent solve that no other agent solves? Weight individual fitness by marginal contribution. Agents with unique coverage get diversity bonus.","estimate":"30min","deps":["cf-01"],"prereqs":[]}
{"id":"cf-03","title":"Niche-preserving selection","type":"implementation","status":"planned","description":"Replace top-N selection with niche-aware selection. Cluster encounters by which agents solve them. Preserve the best agent in each cluster. Fill remaining slots with highest individual fitness. Ensures each encounter niche has at least one specialist.","estimate":"45min","deps":["cf-02"],"prereqs":[]}
{"id":"cf-04","title":"Population health metrics","type":"implementation","status":"planned","description":"Track collective coverage (encounters solved by ≥1 agent), composition diversity (unique tool sets), niche count (distinct specialization clusters), and coverage trajectory across generations. Add to tournament output.","estimate":"30min","deps":["cf-02"],"prereqs":[]}
{"id":"cf-05","title":"Museum of beautiful failures","type":"implementation","status":"planned","description":"Export dead lineage traces as structured training data. For each extinct agent: tool composition, generation of birth, generation of death, best encounter, worst encounter, cause of extinction (outcompeted vs died). Prioritize these in training data export over winner traces.","estimate":"30min","deps":[],"prereqs":[]}
{"id":"cf-06","title":"Tests for community fitness","type":"test","status":"planned","description":"TDD: marginal contribution calculation, niche selection preserves specialists, collective coverage metric, diversity pressure prevents monoculture, museum export format.","estimate":"30min","deps":["cf-02","cf-03","cf-04","cf-05"],"prereqs":[]}
{"id":"cf-07","title":"Pilot tournament with community fitness","type":"test","status":"planned","description":"Run pilot (4 agents, 3 gens) with community fitness. Compare population diversity to session 47 baseline (7/8 monoculture). Key metric: does niche preservation maintain 3+ distinct compositions at convergence?","estimate":"20min","deps":["cf-06"],"prereqs":["ANTHROPIC_API_KEY"]}
```
