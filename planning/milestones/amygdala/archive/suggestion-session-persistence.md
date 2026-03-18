# Suggestion: Session Persistence & Debug CLI

**Source**: user conversation, 2026-03-17 (during hardening QA)
**Motivation**: No way to extract conversation data from the web UI for debugging. Tyler can't easily share a session with Claude for analysis. Also: the pipeline milestone needs a trace ingestion source — this builds it.

## Description

Persist every chat session (messages + SSE trace events) behind a `SessionWriter` abstraction. Ship with a `FileSessionWriter` for dev, swap to `S3SessionWriter` at deploy time. Expose via:

1. **UI**: Session ID visible in the interface, "Export JSON" button for quick copy
2. **CLI**: `scripts/session read <id>`, `scripts/session list` — Claude can use this directly to debug issues Tyler reports
3. **API route**: `/api/sessions/[id]` for programmatic access

## Architecture sketch

```
interface SessionWriter {
  create(id: string): void
  append(id: string, event: TraceEvent): void
  read(id: string): TraceEvent[]
  list(opts?: { limit?: number }): SessionSummary[]
}
```

- `FileSessionWriter` — writes JSONL to `data/sessions/{date}/{id}.jsonl` (dev)
- `S3SessionWriter` — writes to `s3://loopcommons-traces/{date}/{id}.jsonl` (prod)
- Route.ts assigns session ID at request start, passes writer to collector
- Session ID returned in SSE stream + response headers

## Research needed before implementation

- S3 streaming/append patterns (multipart upload vs. buffered write-on-complete)
- DynamoDB single-table design for session index (vs. just listing S3 prefixes)
- Cost modeling at expected trace volume (est. 100-1000 sessions/day at launch)
- Whether this should live in `packages/pipeline` or `packages/web`

## Relationship to pipeline milestone

The Dagster pipeline (amygdala milestone) needs a trace ingestion source. If sessions land as JSONL in S3, the pipeline reads directly from there — no ETL needed for raw ingestion. This makes session persistence the pipeline's "stage 0".
