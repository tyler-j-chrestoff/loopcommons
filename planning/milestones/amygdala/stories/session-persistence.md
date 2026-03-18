# Story: Session Persistence & Trace Storage

> As **Tyler (developer/debugger)**, I can export and inspect any conversation session — messages, trace events, security events — through the UI, CLI, or API, so I can debug issues without reproducing them. As the **data pipeline**, sessions landing as JSONL are "stage 0" — raw ingestion with zero ETL.

## Acceptance Criteria

- Every chat request gets a unique session ID, returned in SSE stream and response headers
- All SSE events (trace, security, rate-limit, spend) are persisted alongside the session, not just streamed ephemerally
- `SessionWriter` interface abstracts storage: `FileSessionWriter` (dev, local JSONL) and `S3SessionWriter` (prod, S3 JSONL)
- UI shows session ID and offers "Export JSON" for the current conversation
- CLI script: `scripts/session read <id>`, `scripts/session list` — usable by Claude to debug issues Tyler reports
- API route: `GET /api/sessions/[id]` for programmatic access
- Session format is JSONL (one event per line) compatible with the Dagster pipeline's raw ingestion layer
- Session index supports lookup by ID and listing by date (file system structure for dev, DynamoDB or S3 prefix listing for prod — informed by research)

## Research Notes (from Session 3 agent — seeds amyg-27)

- **S3 write pattern**: Buffer events in memory during SSE stream, single `PutObjectCommand` on finalize. At 200 events x 5KB = 1MB max, well under multipart threshold. Write-through to `/tmp` for crash resilience.
- **S3 Express One Zone**: Supports true append (`AppendObject`), but 7x storage cost ($0.16 vs $0.023/GB-month). Not justified at this scale.
- **DynamoDB**: ~$0.02/month at 500 sessions/day. Worth it for metadata queries but not on day one — start with S3 prefix listing, add DynamoDB index later (backfillable from S3 data).
- **Cost**: ~$0.23/month total at 500 sessions/day. No optimization needed.
- **Package placement**: Start in `packages/web/src/lib/session/`, extract to `packages/session` when pipeline needs it.
- **Sources**: AWS S3/DynamoDB pricing pages, `@aws-sdk/client-s3` docs, S3 Express One Zone launch (Nov 2024). Verified March 2026.

## Architecture

```
route.ts (POST /api/chat)
    |
    |-- generates session ID (nanoid)
    |-- creates SessionWriter for this session
    |
    v
collector.onEvent(event)
    |-- sendEvent(sanitizeEvent(event))  // existing: SSE to client
    |-- sessionWriter.append(event)      // new: persist to storage
    |
    v
Storage (behind SessionWriter interface)
    |
    ├── FileSessionWriter (dev)
    |   └── data/sessions/{YYYY-MM-DD}/{session-id}.jsonl
    |
    └── S3SessionWriter (prod)
        └── s3://loopcommons-traces/{YYYY-MM-DD}/{session-id}.jsonl
```

## Tasks

```jsonl
{"id":"amyg-27","story":"session-persistence","description":"Research: evaluate S3 streaming/append patterns for JSONL session files. Compare (a) multipart upload streaming, (b) buffer-in-memory + PutObject on complete, (c) S3 Express One Zone. Also evaluate whether DynamoDB is worth it for session indexing vs. S3 prefix listing at expected volume (100-1000 sessions/day). Cost model the decision. Document recommendation with links to AWS docs.","depends_on":[],"status":"done"}
{"id":"amyg-28","story":"session-persistence","description":"Define the SessionWriter interface in packages/web: create(sessionId), append(sessionId, event), finalize(sessionId), read(sessionId) -> AsyncIterable<TraceEvent>, list(opts?) -> SessionSummary[]. Include SessionSummary type (id, date, messageCount, eventCount, durationMs). Place in packages/web/src/lib/session-writer.ts — this is a web concern since route.ts owns it; the pipeline reads from the output location, not through this interface.","depends_on":[],"status":"done"}
{"id":"amyg-29","story":"session-persistence","description":"Implement FileSessionWriter: writes JSONL to data/sessions/{YYYY-MM-DD}/{session-id}.jsonl. append() is synchronous-safe (write + newline). finalize() writes a summary line. read() streams lines back as parsed events. list() reads directory structure. Ensure atomic writes (write to .tmp, rename on finalize).","depends_on":["amyg-28"],"status":"done"}
{"id":"amyg-30","story":"session-persistence","description":"Integrate SessionWriter into route.ts: generate session ID (nanoid) at request start, instantiate writer, hook into collector.onEvent to persist events alongside SSE streaming. Call finalize() in the finally block. Return session ID in SSE stream (session:start event) and X-Session-Id response header. Add session:start and session:complete to ChatSSEEvent type.","depends_on":["amyg-29"],"status":"done"}
{"id":"amyg-31","story":"session-persistence","description":"Build CLI: scripts/session.ts — read <id> (pretty-print events with timestamps), list (tabular: id, date, messages, events, duration). Use FileSessionWriter.read/list directly. Make executable via ts-node or tsx.","depends_on":["amyg-30"],"status":"done"}
{"id":"amyg-32","story":"session-persistence","description":"Build API route: GET /api/sessions/[id] returns the session as JSON (array of events). GET /api/sessions returns session list (summaries). Add pagination (cursor-based, default 20). No auth for now (read-only, no PII in events due to sanitization).","depends_on":["amyg-30"],"status":"done"}
{"id":"amyg-33","story":"session-persistence","description":"Add session UI: display session ID in chat header, 'Export JSON' button that downloads the current session's events as a .jsonl file (fetches from /api/sessions/[id]). Subtle — don't clutter the main chat UX.","depends_on":["amyg-32"],"status":"done"}
{"id":"amyg-34","story":"session-persistence","description":"Implement S3SessionWriter (prod path): uses AWS SDK v3 to write JSONL to S3. Strategy informed by amyg-27 research (likely buffer + PutObject on finalize). Configure via environment variables (S3_BUCKET, AWS_REGION). Gated behind SESSION_STORAGE=s3 env var (default: file).","depends_on":["amyg-27","amyg-29"],"requires":["AWS credentials or localstack for testing"],"status":"pending"}
{"id":"amyg-35","story":"session-persistence","description":"Red-team session persistence: verify (1) no PII leaks in persisted events (IPs, headers stripped), (2) session API doesn't expose raw system prompts (sanitizeEvent already strips these), (3) path traversal in session ID is impossible (validate ID format), (4) large sessions don't OOM the writer.","depends_on":["amyg-32"],"requires":["ANTHROPIC_API_KEY"],"status":"pending"}
```
