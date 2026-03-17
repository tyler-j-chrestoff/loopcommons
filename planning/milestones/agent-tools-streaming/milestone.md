# Milestone: Agent Tools & Streaming

**Status**: completed (2026-03-16)

## Summary

The trace inspector, timeline, and inline tool display are the most interesting parts of the architecture — but they have nothing to show because no tools are registered and responses appear all-at-once. This milestone makes the observability UI meaningful.

## Verification Gate

All of these must pass before this milestone is complete:

- [ ] Agent has 2+ registered tools and uses them in response to user questions
- [ ] Text streams token-by-token (no blank screen while waiting)
- [ ] Trace inspector shows multi-round data with tool execution detail
- [ ] TraceTimeline shows distinct bars for LLM time vs tool execution time
- [ ] ToolCallInline renders collapsible tool I/O in the conversation
- [ ] `rawResponse` is absent from SSE payloads (verify via red-team curl)
- [ ] Cost calculation accounts for cached token discount
- [ ] Independent tool calls execute in parallel

## Stories

```
ls planning/milestones/agent-tools-streaming/stories/
```

| Story | Persona | Summary |
|-------|---------|---------|
| [resume-tool](stories/resume-tool.md) | Hiring manager | Ask about Tyler's experience, see tool trace |
| [project-tool](stories/project-tool.md) | Researcher | Ask about architecture, agent explains its own trace system |
| [tool-wiring](stories/tool-wiring.md) | All users | Tools wired in, system prompt updated, E2E verified |
| [token-streaming](stories/token-streaming.md) | All users | Response appears word-by-word |
| [security-cost](stories/security-cost.md) | Data engineer | Accurate cost, no leaks, parallel tools |
