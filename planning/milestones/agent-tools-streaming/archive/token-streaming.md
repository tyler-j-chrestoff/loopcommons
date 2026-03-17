# Story: Incremental Text Streaming

> As a **user chatting with the agent**, I see the response appear word-by-word as the model generates it, rather than waiting for the full response to load. The trace inspector still captures complete round data after each round finishes.

## Acceptance Criteria

- Agent loop uses `streamText` instead of `generateText` from the Vercel AI SDK
- New SSE event type `text-delta` emitted with partial text chunks
- `useChat` hook accumulates deltas into the assistant message in real-time
- ChatThread renders partial text as it arrives
- Trace events (`round:complete`, `trace:complete`) still fire with full data after each round
- Stop button aborts the stream mid-generation

## Tasks

```jsonl
{"id":"stream-01","story":"token-streaming","description":"Research streamText API in Vercel AI SDK v6 — confirm event shape, tool call handling during streaming, usage reporting","depends_on":[],"status":"done"}
{"id":"stream-02","story":"token-streaming","description":"Modify agent loop to use streamText, emit text-delta events via TraceCollector, preserve round:complete with full data after stream ends","depends_on":["stream-01"],"status":"done"}
{"id":"stream-03","story":"token-streaming","description":"Add text-delta to ChatSSEEvent type, update useChat to accumulate deltas into assistant message, render partial text in ChatThread","depends_on":["stream-02"],"status":"done"}
{"id":"stream-04","story":"token-streaming","description":"E2E via agent-browser: send message, verify text appears incrementally (not all-at-once), verify stop button cancels mid-stream","depends_on":["stream-03"],"requires":["ANTHROPIC_API_KEY"],"status":"done"}
```
