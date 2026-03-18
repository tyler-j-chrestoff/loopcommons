# Story: Session Linking

> As a **returning visitor**, I want my conversations to be connected so that the agent has continuity across visits, and I can see my conversation history as a linked thread.

## Acceptance Criteria

- Sessions can reference a parent session ID via a `parentSessionId` field
- Client stores the most recent session ID in `localStorage`
- On new conversation, client sends the stored session ID as the parent
- Session thread visible in UI: show linked conversation chain (compact list of prior sessions)
- Session API supports querying linked sessions (`GET /api/sessions?thread=<id>`)
- Parent session ID is persisted in session JSONL (in the `session:start` event)

## Architecture

```
localStorage: { lastSessionId: "abc123" }
    |
    v
POST /api/chat  (header: X-Parent-Session-Id: abc123)
    |
    v
route.ts: reads header, passes to SessionWriter
    |
    v
session:start event: { sessionId: "def456", parentSessionId: "abc123", ... }
    |
    v
JSONL: data/sessions/2026-03-17/def456.jsonl
    |
    v
GET /api/sessions?thread=abc123
    → walks parentSessionId links to build thread
    → returns [abc123, def456, ...] in chronological order
```

## Tasks

```jsonl
{"id":"ops-10","story":"session-linking","description":"Add parentSessionId field to session:start event type in packages/web/src/lib/types.ts. Update FileSessionWriter to accept an optional parentSessionId in its create/constructor and include it in the session:start event. Update the SessionSummary type to include parentSessionId.","depends_on":[],"requires":[],"status":"pending"}
{"id":"ops-11","story":"session-linking","description":"Update route.ts to read X-Parent-Session-Id header from the request and pass it to the session writer. The header is optional — first visits won't have one.","depends_on":["ops-10"],"requires":[],"status":"pending"}
{"id":"ops-12","story":"session-linking","description":"Client-side session storage: in use-chat.ts (or a new hook), store the session ID from the session:start SSE event into localStorage. On the next chat request, read from localStorage and send it as the X-Parent-Session-Id header.","depends_on":["ops-11"],"requires":[],"status":"pending"}
{"id":"ops-13","story":"session-linking","description":"Add thread query to session API: GET /api/sessions?thread=<sessionId> returns all sessions in the thread (walks parentSessionId links forward and backward). Returns an array of SessionSummary objects in chronological order. Use the existing FileSessionWriter.list() and filter/walk in memory — no need for a database index at this scale.","depends_on":["ops-10"],"requires":[],"status":"pending"}
{"id":"ops-14","story":"session-linking","description":"Build SessionThread UI component: compact collapsible panel showing linked sessions as a vertical list (session ID snippet, timestamp, message count). Clicking a session loads its events via the session API. Place it in the chat header area near the existing session ID display. Keep it minimal — don't clutter the main chat UX.","depends_on":["ops-12","ops-13"],"requires":[],"status":"pending"}
{"id":"ops-15","story":"session-linking","description":"Write tests for session linking: (1) FileSessionWriter persists parentSessionId in session:start event, (2) thread API returns correct chain when given any session in the thread, (3) thread API returns single session when no parent exists, (4) client sends X-Parent-Session-Id header correctly. Add to packages/web/test/.","depends_on":["ops-13"],"requires":[],"status":"pending"}
```
