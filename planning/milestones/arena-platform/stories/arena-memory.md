# Story: Arena Memory — Agents That Learn From Experience

**Persona**: As a researcher, I need arena agents to actually use their inherited memories during encounters and generate new memories after encounters, so that crossover memory merge produces meaningful evolutionary signal and agents can transfer learned knowledge across encounters and generations.

**Status**: planned

**Context**: Session 56 discovered that arena agents store and inherit memory (mutation copies it, crossover merges weighted by fitness) but memory is never injected into the LLM call during encounters. Agents start every encounter blank. Crossover is dead code.

Three-model convergence (Claude Code + Gemini + Tyler, session 56 discussion) identified the "Selfish Agent" paradox: if memory_remember is an in-band tool consuming mana, evolution selects against agents that use it — zero immediate fitness benefit, 33% exploration budget wasted. The fix decouples reading from doing from learning.

**Design: Bounded Context + Out-of-Band Reflection**

1. **Read path (before encounter):** Recall top-K memories relevant to the encounter prompt. Inject into system prompt as context. Free — no mana cost, no tool call. Uses existing `KeywordMemoryPackage.recall()`.
2. **Encounter (during):** 4 arena tools only. No memory tools. Pure tool-composition signal preserved.
3. **Write path (after encounter):** One unmetered Haiku call outside the mana system. "Here's what you tried, here's what happened — what did you learn?" Output becomes a new memory capsule appended to agent's memoryState.

This keeps the 4-tool composition space pure (measuring what actually matters), guarantees every encounter produces a memory (so crossover has data to merge), and avoids context bloat via relevance filtering.

**Acceptance criteria**:
- Arena agents receive relevant memories in their system prompt before each encounter
- Memory context is relevance-filtered (top-K recall against encounter prompt), not full dump
- Post-encounter reflection generates a memory capsule from the encounter trajectory
- Reflection is out-of-band (not counted in mana or step limits)
- Updated memoryState persists across encounters within a generation
- Updated memoryState is inherited at mutation and merged at crossover (already works)
- Memory uses the existing MemoryContract/KeywordMemoryPackage infrastructure — no parallel path
- Pilot tournament with memory vs without memory shows measurable difference in fitness/coverage/diversity

## Tasks

```jsonl
{"id":"am-01","title":"InMemoryState: array-backed PersistentState","type":"implementation","status":"planned","description":"Create an InMemoryState class implementing PersistentState<Memory[]> backed by a plain array instead of a JSON file. Constructed from a serialized memoryState string (TournamentAgent.memoryState). Provides load()/save() so KeywordMemoryPackage can use it without knowing the backing store. In packages/memory.","estimate":"20min","deps":[],"prereqs":[]}
{"id":"am-02","title":"Memory context injection into encounter prompt","type":"implementation","status":"planned","description":"In task-battery.ts, before each encounter: instantiate KeywordMemoryPackage from agent's memoryState via InMemoryState. Call recall(encounterPrompt, { limit: 5 }) to get top-K relevant memories. Call formatContext() on results. Pass memoryContext string through AgentFnInput to live-agent.ts. In live-agent.ts, prepend memory context section to SYSTEM_PROMPT when present. Add memoryContext?: string to AgentFnInput type.","estimate":"30min","deps":["am-01"],"prereqs":[]}
{"id":"am-03","title":"Post-encounter reflection (out-of-band memory write)","type":"implementation","status":"planned","description":"After executeEncounter() returns in task-battery.ts, make one unmetered Haiku call with the encounter prompt, step trace (tool calls + outputs), and outcome (resolved/died/score). Prompt: summarize what you learned into a concise memory capsule. Parse response into a Memory object (type: learning). Append to agent's InMemoryState. This call is outside mana/step limits.","estimate":"30min","deps":["am-01"],"prereqs":[]}
{"id":"am-04","title":"Memory state persistence across encounters","type":"implementation","status":"planned","description":"After all encounters complete for an agent, serialize InMemoryState back to agent.memoryState. This means encounter N+1 sees memories from encounters 1..N. Task battery must maintain one InMemoryState per agent across the encounter loop, not recreate per encounter.","estimate":"20min","deps":["am-02","am-03"],"prereqs":[]}
{"id":"am-05","title":"Tests for arena memory lifecycle","type":"test","status":"planned","description":"TDD: InMemoryState round-trips Memory[], recall returns relevant memories for encounter prompt, memory context appears in system prompt, reflection produces a valid Memory capsule, memoryState grows across encounters, mutation inherits updated memories, crossover merges updated memories. Mock LLM for reflection tests.","estimate":"30min","deps":["am-01","am-02","am-03","am-04"],"prereqs":[]}
{"id":"am-06","title":"Pilot: memory vs no-memory tournament comparison","type":"test","status":"planned","description":"Run two pilot tournaments (4 agents, 3 gens, --niche): one with memory injection + reflection (--memory flag), one without (current behavior). Compare: fitness trajectory, collective coverage, composition diversity, memory capsule count per agent at convergence. Key question: does memory change the evolutionary dynamics?","estimate":"20min","deps":["am-05"],"prereqs":["ANTHROPIC_API_KEY"]}
```
