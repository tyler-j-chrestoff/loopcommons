# Story: Wire Tools & E2E Verify

> As a **user of the site**, when I ask a question that triggers a tool, I see the tool call appearing inline with collapsible I/O, the trace sidebar showing a multi-round conversation, and the timeline visualizing LLM time vs tool execution time.

## Acceptance Criteria

- Tools are imported and passed to `agent()` in the route handler
- System prompt updated to describe available tools and when to use them
- E2E: ask "Tell me about Tyler's experience" → agent calls `get_resume` → response includes tool data → trace shows 2+ rounds
- E2E: ToolCallInline renders with tool name, input, output, latency
- E2E: TraceTimeline shows distinct bars for LLM round and tool execution
- E2E: cost badge reflects multi-round cost

## Tasks

```jsonl
{"id":"tools-04","story":"tool-wiring","description":"Import tools in route.ts, pass to agent() call, update system prompt to describe available tools","depends_on":["tools-01","tools-03"],"requires":["ANTHROPIC_API_KEY"],"status":"done"}
{"id":"tools-05","story":"tool-wiring","description":"E2E via agent-browser: send tool-triggering message, verify multi-round trace, tool inline, timeline bars, cost accumulation","depends_on":["tools-04"],"requires":["ANTHROPIC_API_KEY"],"status":"done"}
{"id":"tools-06","story":"tool-wiring","description":"Red-team: test tool error handling (what if tool throws?), verify error state renders in ToolCallInline and trace","depends_on":["tools-04"],"status":"done"}
```
