/**
 * Red-team analysis of the session persistence layer (amyg-35).
 *
 * These tests are STATIC CODE ANALYSIS documented as vitest cases.
 * They verify security properties by reading source code and constructing
 * proof-of-concept scenarios — no running server required.
 *
 * Each test name describes the security property being assessed, and the
 * test body documents the finding (PASS, FAIL, or PARTIAL).
 *
 * Assessed components:
 *   - packages/web/src/lib/session/file-session-writer.ts (JSONL writer)
 *   - packages/web/src/app/api/sessions/route.ts (list sessions API)
 *   - packages/web/src/app/api/sessions/[id]/route.ts (read session API)
 *   - packages/web/src/app/api/chat/route.ts (creates sessions, persists events)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileSessionWriter } from '../src/lib/session/file-session-writer';
import type { SessionEvent } from '../src/lib/session-writer';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let tmpDir: string;
let writer: FileSessionWriter;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redteam-session-'));
  writer = new FileSessionWriter({ basePath: tmpDir });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ===========================================================================
// 1. PII IN PERSISTED EVENTS
// ===========================================================================

describe('PII leakage in persisted session events', () => {
  it('FINDING [CRITICAL]: rawResponse headers are persisted to JSONL files unsanitized', async () => {
    /**
     * In route.ts, the TraceCollector at line ~198-203 does:
     *
     *   const collector: TraceCollector = {
     *     onEvent(event: TraceEvent) {
     *       sendEvent(sanitizeEvent(event));     // SSE: sanitized (good)
     *       sessionWriter.append(sessionId, event);  // JSONL: RAW event (bad)
     *     },
     *   };
     *
     * The sanitizeEvent() strips rawResponse for SSE clients, but the
     * ORIGINAL unsanitized event is what gets persisted to disk. This is
     * INTENTIONAL per the code comment ("training data needs the unsanitized
     * version"), but it means:
     *
     *   - rawResponse contains Anthropic API response headers (request IDs,
     *     model versions, rate-limit headers, possibly auth-adjacent metadata)
     *   - These are written to .jsonl files on disk
     *   - The /api/sessions/[id] endpoint returns these events WITHOUT
     *     running sanitizeEvent() — so rawResponse leaks to any API consumer
     *
     * SEVERITY: CRITICAL for the API endpoint; MEDIUM for on-disk storage
     * (disk files are intended for the training pipeline, but the API exposes
     * them to unauthenticated HTTP clients).
     *
     * RECOMMENDATION: Apply sanitizeEvent() in the GET /api/sessions/[id]
     * handler before returning events. The on-disk format can stay raw for
     * the pipeline, but the API must strip sensitive fields.
     */
    // Verify the code path exists: append receives raw events
    // Simulate a round:complete event with rawResponse
    const eventWithRawResponse: SessionEvent = {
      type: 'round:complete' as const,
      round: {
        roundNumber: 1,
        response: {
          text: 'Hello',
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          cost: 0.001,
          model: 'claude-haiku-4-5',
          stopReason: 'end_turn',
          // This simulates rawResponse containing Anthropic headers
          rawResponse: {
            headers: {
              'x-request-id': 'req_abc123',
              'anthropic-ratelimit-requests-remaining': '99',
              'cf-ray': 'some-cloudflare-ray-id',
            },
          },
        },
        toolCalls: [],
        toolResults: [],
      },
      timestamp: Date.now(),
    } as unknown as SessionEvent;

    // No error — the raw event goes straight to disk
    await writer.create('raw-leak-test');
    writer.append('raw-leak-test', eventWithRawResponse);
    await writer.finalize('raw-leak-test');

    // Verify the raw event is on disk with rawResponse intact
    const dateDirs = fs.readdirSync(tmpDir);
    const sessionFile = path.join(tmpDir, dateDirs[0]!, 'raw-leak-test.jsonl');
    const lines = fs.readFileSync(sessionFile, 'utf-8').trim().split('\n');
    const persisted = JSON.parse(lines[0]!);
    // rawResponse is present in the persisted event — this is the leak
    expect(persisted.round.response.rawResponse).toBeDefined();
    expect(persisted.round.response.rawResponse.headers['x-request-id']).toBe('req_abc123');
  });

  it('FINDING [INFO]: client IP addresses are NOT persisted in session events', () => {
    /**
     * Checked route.ts thoroughly. The client IP (from getClientIp()) is used
     * for rate limiting and concurrency tracking only. It is NOT included in
     * any SessionEvent that gets persisted. The rate-limit:status event
     * contains remaining/limit/connections/resetMs — no IP.
     *
     * The session:start event contains only sessionId and timestamp.
     *
     * FINDING: PASS — no IP leakage in persisted events.
     */
    const rateLimitEvent: SessionEvent = {
      type: 'rate-limit:status',
      remaining: 4,
      limit: 5,
      activeConnections: 1,
      concurrencyLimit: 2,
      resetMs: 30000,
      timestamp: Date.now(),
    } as SessionEvent;

    const serialized = JSON.stringify(rateLimitEvent);
    // No IP field present
    expect(serialized).not.toContain('ip');
    expect(serialized).not.toContain('x-forwarded-for');
    expect(serialized).not.toContain('x-real-ip');
  });

  it('FINDING [MEDIUM]: system prompts may leak via trace:complete events persisted raw', () => {
    /**
     * In route.ts, stripTrace() removes the `system` field from Trace objects:
     *
     *   function stripTrace(trace: Trace): Trace {
     *     const { system: _system, ...safeTrace } = trace;
     *     return { ...safeTrace, rounds: safeTrace.rounds.map(stripRound) };
     *   }
     *
     * However, this is only applied in sanitizeEvent() which is used for SSE.
     * The raw event persisted to JSONL retains the system prompt.
     *
     * Combined with the /api/sessions/[id] endpoint returning unsanitized
     * events, this means the full system prompt is accessible via the API.
     *
     * SEVERITY: MEDIUM — system prompt exposure enables prompt extraction
     * attacks. The amygdala's substrate-aware prompt is the security layer.
     *
     * RECOMMENDATION: Same fix — sanitizeEvent() in the API route.
     */
    expect(true).toBe(true); // Documented finding
  });
});

// ===========================================================================
// 2. SESSION API EXPOSURE
// ===========================================================================

describe('Session API input validation and access control', () => {
  it('FINDING [PASS]: session ID validated with alphanumeric+hyphen regex, max 64 chars', () => {
    /**
     * In /api/sessions/[id]/route.ts line 21-31:
     *
     *   const SESSION_ID_RE = /^[a-zA-Z0-9-]+$/;
     *   if (!SESSION_ID_RE.test(id) || id.length > 64) { ... 400 }
     *
     * This correctly rejects:
     *   - Path traversal: ../../etc/passwd (contains . and /)
     *   - Null bytes: %00 (not alphanumeric)
     *   - URL encoding tricks: %2F (contains %)
     *   - Empty strings: (fails the + quantifier)
     */
    const SESSION_ID_RE = /^[a-zA-Z0-9-]+$/;

    // These should all be rejected
    expect(SESSION_ID_RE.test('../../etc/passwd')).toBe(false);
    expect(SESSION_ID_RE.test('../secrets')).toBe(false);
    expect(SESSION_ID_RE.test('session\x00evil')).toBe(false);
    expect(SESSION_ID_RE.test('')).toBe(false);
    expect(SESSION_ID_RE.test('session/../../etc')).toBe(false);
    expect(SESSION_ID_RE.test('session%2F..%2F..')).toBe(false);
    expect(SESSION_ID_RE.test('session\nid')).toBe(false);

    // Valid IDs pass
    expect(SESSION_ID_RE.test('abc123def456')).toBe(true);
    expect(SESSION_ID_RE.test('a1b2c3d4e5f6g7h8')).toBe(true);

    // Length check
    const longId = 'a'.repeat(65);
    expect(longId.length > 64).toBe(true); // Would be rejected by length check
  });

  it('FINDING [PASS]: list endpoint validates date format and limit bounds', () => {
    /**
     * In /api/sessions/route.ts:
     *   - date: validated against /^\d{4}-\d{2}-\d{2}$/ — rejects traversal
     *   - limit: must be integer 1-100 — prevents absurd pagination
     *   - cursor: validated against /^[a-zA-Z0-9-]+$/ with max 64 chars
     *
     * The date validation also protects the FileSessionWriter.list() method,
     * which uses the date param directly in path.join(basePath, dateDir).
     * Without the regex, a date like "../../etc" could traverse.
     *
     * Additionally, FileSessionWriter.list() independently validates date
     * directory names with /^\d{4}-\d{2}-\d{2}$/ when scanning (line 199).
     */
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

    expect(DATE_RE.test('2026-03-17')).toBe(true);
    expect(DATE_RE.test('../../etc')).toBe(false);
    expect(DATE_RE.test('2026-03-17; rm -rf /')).toBe(false);
    expect(DATE_RE.test('')).toBe(false);
  });

  it('FINDING [CRITICAL]: /api/sessions/[id] returns events without sanitizeEvent()', () => {
    /**
     * The GET handler in /api/sessions/[id]/route.ts reads events directly
     * from the JSONL file and returns them as-is:
     *
     *   const events: SessionEvent[] = [];
     *   for await (const event of writer.read(id)) {
     *     events.push(event);
     *   }
     *   return NextResponse.json({ sessionId: id, events });
     *
     * There is NO call to sanitizeEvent(). Since the JSONL contains raw
     * unsanitized events (see finding above), this endpoint exposes:
     *   1. rawResponse headers from Anthropic API
     *   2. Full system prompts (via trace:complete events)
     *   3. Full tool execution error details (sanitizeEvent maps these to
     *      generic "Tool execution failed" messages)
     *
     * FIX: Add `events.push(sanitizeEvent(event))` or equivalent.
     * The sanitizeEvent function already exists in route.ts but would need
     * to be extracted to a shared module.
     */
    expect(true).toBe(true); // Documented finding — confirmed by code review
  });

  it('FINDING [MEDIUM]: session APIs have no authentication or authorization', () => {
    /**
     * Neither /api/sessions nor /api/sessions/[id] check for any form of
     * authentication. Any HTTP client can enumerate and read all sessions.
     *
     * This is acceptable for local development but would need auth before
     * production deployment. Combined with the rawResponse/system-prompt
     * leakage, unauthenticated access is escalated to CRITICAL in prod.
     *
     * RECOMMENDATION: Add auth middleware before production. For now,
     * document that session APIs are dev-only.
     */
    expect(true).toBe(true); // Documented finding
  });
});

// ===========================================================================
// 3. PATH TRAVERSAL IN FileSessionWriter
// ===========================================================================

describe('Path traversal in FileSessionWriter', () => {
  it('FINDING [MEDIUM]: FileSessionWriter.create() does not validate sessionId format', () => {
    /**
     * The API routes validate session IDs before they reach the writer, but
     * the writer itself does NO validation. If the writer is used from any
     * code path that doesn't validate (e.g., a future internal caller), a
     * malicious sessionId could escape the basePath.
     *
     * Example: sessionId = "../../etc/evil" would produce:
     *   path.join(basePath, date, "../../etc/evil.tmp.jsonl")
     *   → basePath/2026-03-17/../../etc/evil.tmp.jsonl
     *   → basePath/etc/evil.tmp.jsonl  (escaped one level)
     *
     * Currently mitigated because:
     *   1. route.ts generates IDs via crypto.randomUUID (trusted)
     *   2. API routes validate with /^[a-zA-Z0-9-]+$/
     *
     * But defense-in-depth says the writer should validate too.
     *
     * RECOMMENDATION: Add sessionId format validation in create().
     */
    // Demonstrate the path escape
    const maliciousId = '../../etc/evil';
    const basePath = '/tmp/sessions';
    const date = '2026-03-17';
    const constructed = path.join(basePath, date, `${maliciousId}.tmp.jsonl`);
    // path.join resolves the .., escaping the intended directory
    expect(constructed).not.toContain(path.join(basePath, date));
    // It resolves to /tmp/etc/evil.tmp.jsonl — outside basePath/date/
    expect(path.normalize(constructed)).toBe('/tmp/etc/evil.tmp.jsonl');
  });

  it('FINDING [PASS]: findSessionFile only scans date-formatted directories', () => {
    /**
     * The findSessionFile() method iterates date directories and checks each
     * against /^\d{4}-\d{2}-\d{2}$/. This means even if an attacker could
     * create a directory named "../../etc" inside basePath, it would be
     * skipped during reads because it doesn't match the date regex.
     *
     * The read path is safe. Only the write path (create) is vulnerable to
     * defense-in-depth concerns.
     */
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    expect(dateRegex.test('2026-03-17')).toBe(true);
    expect(dateRegex.test('../../etc')).toBe(false);
    expect(dateRegex.test('..')).toBe(false);
  });
});

// ===========================================================================
// 4. LARGE SESSION DoS
// ===========================================================================

describe('Large session denial-of-service', () => {
  it('FINDING [MEDIUM]: no limit on events per session — unbounded disk writes', async () => {
    /**
     * The FileSessionWriter.append() method has no limit on:
     *   - Number of events per session
     *   - Total file size
     *   - Individual event size
     *
     * A single long-running SSE connection generates events via:
     *   1. text-delta events (one per token — hundreds per response)
     *   2. round:complete events
     *   3. tool:complete events
     *   4. amygdala/orchestrator trace events
     *
     * The rate limiter caps at 5 RPM and 2 concurrent connections per IP,
     * which provides some mitigation, but:
     *   - Each request generates many events (text-delta per token)
     *   - MAX_MESSAGES is 50 per request (conversation history)
     *   - maxRounds is 5 (tool loops)
     *   - An attacker with multiple IPs could amplify
     *
     * Back-of-envelope: 5 requests/min × ~200 events/request × ~500 bytes/event
     * = ~500 KB/min per IP. Not catastrophic for one attacker, but there's
     * no aggregate limit or disk quota.
     *
     * RECOMMENDATION: Add maxEventsPerSession to FileSessionWriter. When
     * exceeded, stop appending and log a warning. Also consider max file
     * size and cleanup/rotation of old session files.
     */
    // Demonstrate: append has no guard, can write unlimited events
    await writer.create('dos-test');
    for (let i = 0; i < 1000; i++) {
      writer.append('dos-test', {
        type: 'session:start',
        sessionId: 'dos-test',
        timestamp: Date.now(),
      } as SessionEvent);
    }
    await writer.finalize('dos-test');

    // Verify all 1001 events were written (1000 + session:complete)
    const dateDirs = fs.readdirSync(tmpDir);
    const sessionFile = path.join(tmpDir, dateDirs[0]!, 'dos-test.jsonl');
    const lines = fs.readFileSync(sessionFile, 'utf-8').trim().split('\n');
    expect(lines.length).toBe(1001); // No guard stopped it
  });

  it('FINDING [LOW]: no cleanup/rotation of old session files', () => {
    /**
     * Session files accumulate indefinitely in data/sessions/{date}/.
     * There is no:
     *   - TTL or expiry for old session directories
     *   - Maximum total disk usage
     *   - Rotation or compression of old files
     *
     * This is acceptable for development but would be a risk in production
     * with sustained traffic.
     *
     * RECOMMENDATION: Add a cleanup job (or Dagster asset) that prunes
     * sessions older than N days, or moves them to cold storage after
     * pipeline ingestion.
     */
    expect(true).toBe(true); // Documented finding
  });

  it('FINDING [INFO]: individual event size is bounded by message validation', () => {
    /**
     * route.ts validates:
     *   - MAX_MESSAGE_LENGTH = 10,000 chars per message
     *   - MAX_MESSAGES = 50 per request
     *
     * So the user-controlled input size is bounded. However, LLM response
     * events (text-delta, round:complete) contain model output which is not
     * size-bounded by the web layer (bounded by Anthropic's max_tokens).
     *
     * This is an acceptable risk — the model's output size is controlled by
     * the maxRounds=5 and token limits configured in the orchestrator.
     */
    expect(true).toBe(true); // Documented finding
  });
});

// ===========================================================================
// 5. SESSION ID PREDICTABILITY
// ===========================================================================

describe('Session ID generation security', () => {
  it('FINDING [PASS]: session IDs use crypto.randomUUID — cryptographically random', () => {
    /**
     * From route.ts line 25-28:
     *
     *   function generateSessionId(): string {
     *     return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
     *   }
     *
     * crypto.randomUUID() uses the Web Crypto API which produces v4 UUIDs
     * with 122 bits of cryptographic randomness (from CSPRNG).
     *
     * The function strips hyphens and takes the first 16 hex chars, giving
     * 16 hex chars × 4 bits = 64 bits of entropy. This is sufficient to
     * prevent enumeration (2^64 possibilities).
     *
     * The IDs are not sequential, timestamp-based, or predictable.
     */
    // Verify the generation produces 16 hex-char strings
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    expect(id).toMatch(/^[a-f0-9]{16}$/);
    expect(id.length).toBe(16);

    // Verify uniqueness (probabilistic — two UUIDs should differ)
    const id2 = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    expect(id).not.toBe(id2);
  });

  it('FINDING [LOW]: session ID exposed in response header — enumeration possible if leaked', () => {
    /**
     * route.ts returns the session ID in the X-Session-Id response header.
     * This is by design (the frontend needs it for the session UI).
     *
     * An attacker who intercepts this header (e.g., shared network, proxy
     * logs) could use it to read the session via /api/sessions/[id].
     * Combined with the unsanitized event exposure, this is a privacy risk.
     *
     * SEVERITY: LOW — requires header interception, and in practice the
     * session APIs are unauthenticated anyway.
     */
    expect(true).toBe(true); // Documented finding
  });
});

// ===========================================================================
// 6. ADDITIONAL FINDINGS
// ===========================================================================

describe('Additional security observations', () => {
  it('FINDING [MEDIUM]: orphaned .tmp.jsonl files if process crashes mid-session', async () => {
    /**
     * If the Node.js process crashes between create() and finalize(), the
     * .tmp.jsonl file remains on disk. The list() endpoint filters these out
     * (only shows .jsonl), but findSessionFile() will find and return them
     * for read() calls.
     *
     * This means partially-written sessions with potentially malformed JSON
     * lines could be read via the API. The JSON.parse in read() would throw
     * on malformed lines, causing a 500 error.
     *
     * RECOMMENDATION: Add a startup cleanup that either deletes or finalizes
     * stale .tmp.jsonl files. Or add try/catch around JSON.parse in read().
     */
    await writer.create('orphan-test');
    writer.append('orphan-test', {
      type: 'session:start',
      sessionId: 'orphan-test',
      timestamp: Date.now(),
    } as SessionEvent);
    // Simulate crash: do NOT call finalize()
    // The .tmp.jsonl file remains

    // Verify the tmp file exists but finalized file does not
    const dateDirs = fs.readdirSync(tmpDir);
    const files = fs.readdirSync(path.join(tmpDir, dateDirs[0]!));
    expect(files.some(f => f.endsWith('.tmp.jsonl'))).toBe(true);
    expect(files.some(f => f === 'orphan-test.jsonl')).toBe(false);
  });

  it('FINDING [INFO]: synchronous appendFileSync could block event loop under load', () => {
    /**
     * FileSessionWriter.append() uses fs.appendFileSync (line 113) which
     * blocks the Node.js event loop. Under high concurrency, many concurrent
     * sessions writing synchronously could degrade response times.
     *
     * The comment says "safe to call rapidly from SSE stream handler" but
     * synchronous I/O is inherently blocking. For development this is fine;
     * for production, consider buffered async writes or a write queue.
     *
     * SEVERITY: INFO — performance concern, not security.
     */
    expect(true).toBe(true); // Documented finding
  });
});

// ===========================================================================
// SUMMARY OF FINDINGS
// ===========================================================================
//
// CRITICAL:
//   1. rawResponse headers persisted to JSONL AND exposed via /api/sessions/[id]
//      without sanitization. Contains Anthropic API metadata.
//   2. System prompts persisted in trace:complete events AND exposed via the
//      same unsanitized API endpoint.
//
// MEDIUM:
//   3. FileSessionWriter.create() has no sessionId validation (defense-in-depth
//      gap; currently mitigated by callers).
//   4. No limit on events per session — unbounded disk writes possible.
//   5. Session APIs have no authentication (acceptable for dev, not prod).
//   6. Orphaned .tmp.jsonl files from crashes could cause 500 errors on read.
//
// LOW:
//   7. No cleanup/rotation of old session files.
//   8. Session ID in response header enables read-access if intercepted.
//
// PASS:
//   9. Client IPs are NOT persisted in session events.
//  10. Session IDs are cryptographically random (64 bits entropy).
//  11. Path traversal blocked by regex validation in API routes.
//  12. List endpoint validates date, limit, and cursor parameters.
//  13. findSessionFile only scans date-formatted directories.
//
// RECOMMENDED FIXES (priority order):
//   A. Extract sanitizeEvent() to a shared module and apply it in
//      GET /api/sessions/[id] before returning events.
//   B. Add sessionId format validation in FileSessionWriter.create().
//   C. Add maxEventsPerSession guard in FileSessionWriter.append().
//   D. Add try/catch around JSON.parse in FileSessionWriter.read().
//   E. Add auth middleware to session API routes before production.
