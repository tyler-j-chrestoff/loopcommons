# Story: Accurate Cost, No Leaks, Parallel Tools

> As a **data engineer reviewing the trace data**, I see accurate cost figures that account for prompt caching, no leaked API infrastructure headers, and tool executions that run in parallel when independent.

## Acceptance Criteria

- `rawResponse` stripped from trace events before sending over SSE (keep server-side for debugging)
- Cost formula updated: `(uncachedInput * 1.0 + cached * 0.1 + output * 5.0) / 1M`
- `cachedTokens` displayed in TraceInspector alongside input/output tokens
- Independent tool calls within a round execute via `Promise.allSettled` instead of serial `for...of`
- Tool execution timing in TraceTimeline reflects parallel execution (overlapping bars)

## Tasks

```jsonl
{"id":"sec-01","story":"security-cost","description":"Strip rawResponse from round data in route.ts before sending SSE events. Deep-clone round, delete rawResponse.","depends_on":[],"status":"done"}
{"id":"sec-02","story":"security-cost","description":"Update calculateCost in loop.ts to account for cachedTokens at $0.10/MTok. Make pricing model-aware (lookup table keyed by model prefix).","depends_on":[],"status":"done"}
{"id":"sec-03","story":"security-cost","description":"Surface cachedTokens in TraceInspector summary and RoundDetail. Show cache hit rate percentage.","depends_on":["sec-02"],"status":"done"}
{"id":"sec-04","story":"security-cost","description":"Switch tool execution from serial for...of to Promise.allSettled. Preserve per-tool timing. Update TraceTimeline to show overlapping tool bars.","depends_on":[],"status":"done"}
{"id":"sec-05","story":"security-cost","description":"Red-team: verify rawResponse is absent from SSE payload, verify cost matches manual calculation with known cached/uncached splits","depends_on":["sec-01","sec-02"],"requires":["ANTHROPIC_API_KEY"],"status":"done"}
```
