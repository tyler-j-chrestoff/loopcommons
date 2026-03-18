# Story: Subagent Routing & Least-Privilege Tool Access

> As a **normal user**, my conversation flows naturally — the routing is invisible and I get the same quality responses. As an **attacker**, even if I bypass the amygdala, I can only reach the tools available to whichever subagent I'm routed to, not the full tool registry.

## Acceptance Criteria

- The current single `agent()` call is replaced by an orchestrator that routes amygdala output to specialized subagents
- Each subagent has a fixed, minimal tool set (e.g., resume subagent only has `get_resume`)
- Tool registry enforces isolation — a subagent cannot access tools outside its allowlist
- Router maps amygdala intent classifications to subagents
- Fallback subagent (no tools, conversational only) handles unclassified or high-threat inputs
- Context stratification: subagents receive only the conversation history and memory that the amygdala's context delegation plan allows — not the full history. Each subagent defines its context requirements; the orchestrator intersects these with the amygdala's delegation plan.
- Trace events capture routing decisions: which subagent was chosen, why, and what context was delegated vs. withheld

## Tasks

```jsonl
{"id":"amyg-07","story":"subagent-routing","description":"Define the subagent registry: enumerate initial subagents (resume, project, security, conversational-fallback) with their tool allowlists, system prompt fragments, and context requirements (what conversation history and memory each subagent needs). Context requirements are declarative — the orchestrator uses them to filter what the amygdala delegates. Design as a declarative config in packages/llm.","depends_on":["amyg-03"],"status":"pending"}
{"id":"amyg-08","story":"subagent-routing","description":"Refactor the tool registry in packages/llm to support scoped tool sets. Each subagent receives only its allowed tools. The agent() function accepts a tool subset rather than the full registry.","depends_on":["amyg-07"],"status":"pending"}
{"id":"amyg-09","story":"subagent-routing","description":"Build the orchestrator: receives amygdala output (rewritten prompt, intent, threat score, context delegation plan), selects subagent from registry, builds the subagent's context window by intersecting the amygdala's delegation plan with the subagent's declared context requirements, invokes agent() with scoped tools and filtered context. High-threat inputs route to conversational-fallback (no tools, minimal context). Streams trace events from both layers including context delegation decisions.","depends_on":["amyg-04","amyg-08"],"status":"done"}
{"id":"amyg-10","story":"subagent-routing","description":"Integrate orchestrator in route.ts: replace the current direct agent() call with the amygdala -> router -> subagent pipeline. Ensure SSE streaming still works end-to-end.","depends_on":["amyg-09"],"status":"done"}
{"id":"amyg-11","story":"subagent-routing","description":"Red-team routing isolation: inject prompts designed to make a subagent call tools outside its allowlist, or to trick the router into selecting a more privileged subagent. Verify tool scoping holds.","depends_on":["amyg-10"],"requires":["ANTHROPIC_API_KEY"],"status":"done"}
```
