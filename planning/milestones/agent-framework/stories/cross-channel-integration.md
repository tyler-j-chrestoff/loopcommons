# Story: Cross-Channel Integration + Discord Prep

**Milestone:** agent-framework (Phase C)
**Traces to:** brain-architecture.md §2.4, §2.5, §4 — the full cross-channel loop

## Why

S60 builds the subsystems, S61 adds SMS + identity. This story proves the full loop: same person on web + SMS, linked identity, shared memories, contradiction detection, provenance-tracked consolidation. Also researches Discord as channel three.

## Acceptance Criteria

- End-to-end: web user + SMS user linked, conversation on both channels, memories shared
- ConflictMonitor catches cross-channel contradictions in real conversation
- Consolidator merges memories with correct provenance from both channels
- Receipt rendering includes cross-channel provenance
- Discord research complete with story/task plan for channel three

## Tasks

```jsonl
{"id":"xi-01","title":"Cross-channel E2E test suite","description":"Integration tests with real Router pipeline: user chats on web, links SMS, chats on SMS. Verify shared memory recall, contradiction detection, provenance on stored memories.","deps":[],"prereqs":["S60 and S61 complete"]}
{"id":"xi-02","title":"Receipt rendering with provenance","description":"Extend receipt renderer to show channel provenance. Human-readable: 'Memory formed from web chat (Mar 24) + SMS (Mar 25)'. Serves commitment #2 (auditable by default).","deps":["xi-01"],"prereqs":[]}
{"id":"xi-03","title":"Cross-channel memory recall","description":"When recalling memories for a user, include memories from all linked channels. Consolidator's provenance metadata enables 'you mentioned X on SMS last Tuesday' style recall.","deps":["xi-01"],"prereqs":[]}
{"id":"xi-04","title":"Research: Discord adapter","description":"Research task. discord.js v14 SDK, gateway intents, bot registration, persistent process requirements. Plan DiscordAdapter story with tasks. Consider Railway deployment as separate service.","deps":[],"prereqs":[]}
{"id":"xi-05","title":"Conflict resolution UX","description":"When ConflictMonitor flags a contradiction, how does the agent handle it? Design the response pattern: acknowledge the conflict, ask for clarification, don't assume either channel was correct.","deps":["xi-01"],"prereqs":[]}
{"id":"xi-06","title":"Red-team: cross-channel attacks","description":"Adversarial: user on SMS tries to override web memories, identity spoofing via phone number reuse, rapid channel switching to confuse ConflictMonitor, unlinked user shouldn't see other channel's memories.","deps":["xi-03"],"prereqs":[]}
```
