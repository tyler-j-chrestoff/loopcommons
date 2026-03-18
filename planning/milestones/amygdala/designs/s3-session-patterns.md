# Design: S3 Session Persistence Patterns (amyg-27)

**Status**: Complete (formalized from session 3 research)
**Sources**: AWS S3 API docs, `@aws-sdk/client-s3` v3 docs, S3 Express One Zone launch (Nov 2024), DynamoDB pricing page. Verified March 2026.

## Decision: Buffer + PutObject

**Write pattern**: Buffer events in memory during SSE stream, single `PutObjectCommand` on finalize.

At expected volume (200 events/session x ~5KB avg = ~1MB max per session), this is well under the 5GB single-PUT limit and the 5MB multipart threshold. No streaming upload needed.

### Why not alternatives?

| Pattern | Verdict | Reason |
|---------|---------|--------|
| Buffer + PutObject | **Use this** | Simple, one API call per session, fits volume |
| Multipart upload streaming | Over-engineered | Session files are <1MB; multipart minimum part is 5MB |
| S3 Express One Zone (AppendObject) | Too expensive | True append support, but 7x storage cost ($0.16 vs $0.023/GB-month). Not justified at this scale. |
| S3 standard append | Not possible | S3 standard has no append — only full object replacement |

### Crash resilience

Write-through to `/tmp/{session-id}.jsonl` during the stream. If the process crashes before `finalize()`, the temp file survives for recovery. On finalize, upload to S3 then delete the temp file.

```
append(event) {
  this.buffer.push(event);
  fs.appendFileSync(`/tmp/${this.sessionId}.jsonl`, JSON.stringify(event) + '\n');
}

finalize() {
  const body = this.buffer.map(e => JSON.stringify(e)).join('\n') + '\n';
  await s3.send(new PutObjectCommand({ Bucket, Key, Body: body }));
  fs.unlinkSync(`/tmp/${this.sessionId}.jsonl`);
}
```

## Session indexing: S3 prefix listing (not DynamoDB)

**Decision**: Start with S3 prefix listing. Add DynamoDB later if needed.

### Cost model (500 sessions/day)

| Component | Monthly cost |
|-----------|-------------|
| S3 storage (500 x 30 x 1MB = 15GB) | ~$0.35 |
| S3 PUT requests (500 x 30 = 15K) | ~$0.08 |
| S3 GET/LIST requests | ~$0.01 |
| **Total (S3 only)** | **~$0.44/month** |
| DynamoDB (if added) | +~$0.02/month |

DynamoDB adds ~$0.02/month for metadata queries but introduces another AWS service dependency. Not worth it on day one. The S3 key structure supports efficient prefix listing:

```
s3://loopcommons-traces/{YYYY-MM-DD}/{session-id}.jsonl
```

List by date = `ListObjectsV2` with prefix `2026-03-17/`. DynamoDB becomes valuable only when we need cross-date queries (e.g., "find all sessions with threat score > 0.8") — at that point, the Dagster pipeline can backfill a DynamoDB index from S3 data.

## Package placement

Start in `packages/web/src/lib/session/`. The `SessionWriter` interface lives alongside `FileSessionWriter` and `S3SessionWriter` implementations. Extract to `packages/session` only when the pipeline package needs to import it directly (the pipeline reads from S3/filesystem output, not through the writer interface).

## Key configuration (env vars)

```
SESSION_STORAGE=file|s3        # default: file
S3_SESSION_BUCKET=loopcommons-traces
AWS_REGION=us-east-1
# AWS credentials via standard SDK chain (env vars, instance profile, etc.)
```
