# Story: Arena Agent ToolPackage

**Persona**: As an agent, I need to query tournament state through my tool interface, so I can answer questions about arena results without the human parsing terminal output.

**Status**: done

**Context**: The site agent (and Claude Code) should be able to call `queryTournament` to get leaderboards, compare compositions, and list recent tournaments. Follows the ToolPackage pattern.

**Acceptance criteria**:
- queryArena ToolPackage with query, list, and compare tools
- Agent can answer "what's the current best composition?" via tool call
- Tools are read-only (no side effects)
- Registered in the agent's tool set when arena data exists

## Tasks

```jsonl
{"id":"at-01","title":"queryArena ToolPackage definition","type":"implementation","status":"done","description":"Define ToolPackage with three tools: queryTournament (current state/leaderboard), listTournaments (recent/active), compareFitness (compare compositions across generations). All read-only.","estimate":"30min","deps":[],"prereqs":[]}
{"id":"at-02","title":"Wire ToolPackage into agent core","type":"implementation","status":"done","description":"Register arena ToolPackage in route.ts tool assembly. Only available when tournament data exists in data directory.","estimate":"15min","deps":["at-01"],"prereqs":[]}
{"id":"at-03","title":"Tests for arena tools","type":"test","status":"done","description":"TDD: tool responses match expected shapes, tools handle missing data gracefully, derived prompts describe arena capabilities.","estimate":"20min","deps":["at-01"],"prereqs":[]}
```
