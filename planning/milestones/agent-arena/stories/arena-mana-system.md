# Story: Arena Mana System — Forcing Agents to Act

**Persona**: As a researcher, I need agents that actually use their tools to resolve encounters instead of writing prose about what they'd do, so the tournament produces meaningful fitness differentiation.

**Status**: done

**Context**: Session 44 discovered the root cause of tournament collapse — Haiku generates text after 2-3 diagnostic tool calls instead of continuing to act. AI SDK's `generateText` treats text output as loop termination. Three reinforcing mechanisms fix this: (1) `toolChoice: 'required'` + terminal `done` tool, (2) phase-based mana gating (exploration budget → action-only), (3) per-step tool filtering via `prepareStep`.

**Acceptance criteria**:
- `done` tool signals encounter completion; `toolChoice: 'required'` forces tool use every step
- `prepareStep` filters available tools based on mana state (N exploration slots → action-only)
- Lego 2: single encounter + live agent validates done/toolChoice fix
- Lego 3: one generation (3 agents, 3 encounters) shows fitness differentiation

## Tasks

```jsonl
{"id":"mn-01","title":"Done tool + toolChoice:required","type":"implementation","status":"done","description":"Add done tool to sandbox-tools.ts (no params, signals completion). Update createLiveAgentFn to pass toolChoice:'required' to generateText. Add exit condition: check result.steps for done tool call. Update system prompt to instruct WORKFLOW: Explore → Diagnose → Act → done.","estimate":"45min","deps":[],"prereqs":[]}
{"id":"mn-02","title":"Done tool + toolChoice tests","type":"test","status":"done","description":"TDD: done tool returns completion signal, toolChoice:required is passed through, agent loop exits on done call, maxSteps still enforced as hard limit. Unit tests in sandbox-tools and live-agent test files.","estimate":"30min","deps":[],"prereqs":[]}
{"id":"mn-03","title":"Mana state + prepareStep module","type":"implementation","status":"done","description":"New arena/mana.ts: ManaConfig (initialExplorationSlots, toolCosts per ArenaToolId), ManaState (slots remaining, used), prepareStep(state, allTools, config) → filtered tools. Exploration tools (inspect/search/model) cost slots; act/done are free and always available.","estimate":"45min","deps":["mn-02"],"prereqs":[]}
{"id":"mn-04","title":"Mana prepareStep tests","type":"test","status":"done","description":"TDD: prepareStep returns all tools when slots remain, returns only act+done when depleted, slot costs tracked correctly, edge cases (0 slots = action-only from start, high slots = never restricted).","estimate":"30min","deps":[],"prereqs":[]}
{"id":"mn-05","title":"Mana integration into encounter engine + live agent","type":"implementation","status":"done","description":"Wire mana into executeEncounter (optional manaConfig param) and createLiveAgentFn (step-by-step loop with per-step tool filtering via prepareStep). Track mana usage in RunState. Backward compatible — no manaConfig = all tools always available.","estimate":"60min","deps":["mn-01","mn-03"],"prereqs":[]}
{"id":"mn-06","title":"Mana integration tests","type":"test","status":"done","description":"Encounter engine passes mana config to agent. Agent filters tools per step. Mana depletion forces action. Full encounter flow with mana gating. Backward compat: no manaConfig = existing behavior unchanged.","estimate":"30min","deps":["mn-05"],"prereqs":[]}
{"id":"mn-07","title":"Lego 2: single encounter + live agent validation","type":"test","status":"done","description":"Live API test (gated by ANTHROPIC_API_KEY): run one brutal encounter (E7 Hydra) with live Haiku agent using done tool + toolChoice:required + mana. Verify: agent calls act (not just diagnostic tools), agent calls done, encounter resolves or agent dies from wrong action (not inaction).","estimate":"30min","deps":["mn-05"],"prereqs":["ANTHROPIC_API_KEY"]}
{"id":"mn-08","title":"Task battery mana passthrough","type":"implementation","status":"done","description":"Update createTaskBattery to accept optional ManaConfig. Pass through to executeEncounter. Tournament runner passes mana config from TournamentConfig.","estimate":"20min","deps":["mn-05"],"prereqs":[]}
{"id":"mn-09","title":"Lego 3: one generation fitness differentiation","type":"test","status":"done","description":"Live API test: 3 agents with different tool compositions, 3 encounters, 1 generation. Verify: fitness scores differ meaningfully (not all 0.33/0.25/0.00), at least one agent completes an encounter, collateral differentiates agents who act wrong vs. don't act.","estimate":"45min","deps":["mn-07","mn-08"],"prereqs":["ANTHROPIC_API_KEY"]}
```
