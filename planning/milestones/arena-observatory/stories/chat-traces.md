# Story: Chat Traces in Observatory

**Persona**: As a visitor, I want to see the site agent's real conversations alongside tournament traces, so I understand this is the same agent in different contexts — not two separate systems.

**Status**: deferred

**Context**: Chat sessions already persist full traces via SessionWriter (JSONL with tool calls, amygdala reasoning, judge scores). The replay component from encounter-replay can render these too. But the chat trace format has extra dimensions (amygdala, orchestrator routing, memory writes) that need UI affordances. Defer until the tournament replay format is proven.

**Acceptance criteria**:
- Chat sessions appear in the observatory alongside tournament traces
- Same replay component renders both (tool call timeline)
- Chat-specific data visible: amygdala threat assessment, routing decisions, memory writes
- Visitor can compare how the agent behaves in chat vs tournament
- Unified trace schema documented

## Tasks

```jsonl
{"id":"ct-01","title":"Research: unify chat SessionEvent and tournament StepRecord","type":"research","status":"planned","description":"Map SessionEvent types to a common trace format. Identify gaps: amygdala events, orchestrator routing, memory writes have no tournament equivalent. Design adapter or union type.","estimate":"30min","deps":[],"prereqs":["encounter-replay story proven in production"]}
{"id":"ct-02","title":"Chat trace adapter","type":"implementation","status":"planned","description":"Adapter that reads SessionWriter JSONL and produces the unified trace format. Chat-specific events (amygdala, routing) become annotated steps in the timeline.","estimate":"30min","deps":["ct-01"],"prereqs":[]}
{"id":"ct-03","title":"Chat traces in observatory UI","type":"implementation","status":"planned","description":"Chat sessions appear in /arena alongside tournaments. Click to replay with tool calls + amygdala reasoning visible. Filter by source (chat, tournament, roguelike).","estimate":"35min","deps":["ct-02"],"prereqs":[]}
{"id":"ct-04","title":"Tests for chat trace integration","type":"test","status":"planned","description":"TDD: adapter correctly maps SessionEvents, replay renders chat traces, amygdala annotations visible, filter works, mixed-source list correct.","estimate":"25min","deps":["ct-02","ct-03"],"prereqs":[]}
```
