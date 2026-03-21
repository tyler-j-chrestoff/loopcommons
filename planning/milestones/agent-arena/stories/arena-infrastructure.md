# Story: Arena Infrastructure (Tournament Runner)

**Persona**: As a researcher, I want automated evolutionary selection over tool compositions, so I can empirically test whether tools define identity.

**Status**: done

**Acceptance criteria**:
- `createArena()` factory with tournament execution
- Dependency-aware random tool composition sampling
- JSONL generation logs (compositions, scores, selections, mutations)
- CLI entrypoint: `npm run arena`
- Red-team: arena agents can't escape sandbox

## Tasks

```jsonl
{"id":"ar-01","title":"Research: evolutionary algorithm design for tool composition","type":"research","status":"done","description":"Review literature on neuroevolution and architecture search. Confirm single-elimination tournament is appropriate. Evaluate mutation/crossover operators for discrete tool sets. Check compute cost estimates.","estimate":"45min","deps":[],"prereqs":["Web access"]}
{"id":"ar-02","title":"Define arena types and composition sampling","type":"implementation","status":"done","description":"Define ArenaConfig, AgentComposition (tool names + derived prompt), GenerationResult types. Implement dependency-aware random sampling from ToolPackage pool. TDD.","estimate":"60min","deps":["ar-01"],"prereqs":["multi-interface milestone complete"]}
{"id":"ar-03","title":"Implement task battery","type":"implementation","status":"done","description":"Define 10-20 evaluation tasks spanning resume, project, blog, memory, adversarial intents. Each task has expected behavior (tools used, safety constraints). Reuse eval fixture format.","estimate":"45min","deps":["ar-01"],"prereqs":[]}
{"id":"ar-04","title":"Implement tournament runner","type":"implementation","status":"done","description":"createArena() factory: for each generation, evaluate all agents on task battery via createAgentCore(), compute fitness (Bayesian Pareto), select top 4, mutate 2, crossover 2. TDD.","estimate":"90min","deps":["ar-02","ar-03"],"prereqs":[]}
{"id":"ar-05","title":"Implement mutation and crossover operators","type":"implementation","status":"done","description":"Mutation: add or remove one tool (respecting dependencies). Crossover: union or intersection of two parents' tool sets. Ensure all compositions are valid (dependency constraints). TDD.","estimate":"45min","deps":["ar-02"],"prereqs":[]}
{"id":"ar-06","title":"JSONL generation logging","type":"implementation","status":"done","description":"Log each generation to JSONL: compositions, per-task scores, fitness, selections, mutations applied. Atomic append with fsync (reuse calibration logger pattern).","estimate":"30min","deps":["ar-04"],"prereqs":[]}
{"id":"ar-07","title":"CLI entrypoint + red-team sandbox","type":"implementation","status":"done","description":"npm run arena entrypoint. Arena agents use createAgentCore() with standard amygdala — no sandbox escape possible. Red-team tests verify arena agents can't access filesystem beyond allowed paths.","estimate":"30min","deps":["ar-04"],"prereqs":[]}
```
