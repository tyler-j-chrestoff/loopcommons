# Suggestion: Cross-Session Memory

**Source**: user conversation, 2026-03-18

**Description**: The agent currently starts fresh every session — no awareness of prior conversations. Session linking exists for the UI but the agent never sees it. The `memoryContext` field on `AmygdalaInput` exists but is never populated.

The agent should have some form of memory across sessions. What that looks like is wide open: could be summaries, could be raw history, could be embeddings, could be something entirely different. The right approach probably depends on what we learn from the trace data and how context engineering evolves.

No specific implementation direction chosen. Research first.
