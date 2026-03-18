/**
 * FileSessionWriter — local JSONL-based session persistence for development.
 *
 * amyg-29: Writes session trace events as newline-delimited JSON files.
 *
 * File layout:
 *   {basePath}/{YYYY-MM-DD}/{session-id}.tmp.jsonl   (during writes)
 *   {basePath}/{YYYY-MM-DD}/{session-id}.jsonl        (after finalize)
 *
 * Readers only see .jsonl files (finalized sessions). The .tmp.jsonl -> .jsonl
 * rename on finalize is atomic on POSIX filesystems.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

import type {
  SessionWriter,
  SessionEvent,
  SessionSummary,
  SessionListOptions,
  SessionListResult,
} from '../session-writer';

// ---------------------------------------------------------------------------
// Internal metadata tracked per active session
// ---------------------------------------------------------------------------

type ActiveSession = {
  sessionId: string;
  parentSessionId?: string;
  date: string; // YYYY-MM-DD
  tmpPath: string;
  finalPath: string;
  startTime: number;
  eventCount: number;
  messageCount: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateString(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Returns true for event types that represent a user or assistant message. */
function isMessageEvent(event: SessionEvent): boolean {
  // round:complete carries the assistant response for a round.
  // session:start is the user-initiated turn.
  // text-delta is streaming content but doesn't represent a discrete message.
  if (event.type === 'round:complete') return true;
  if (event.type === 'session:start') return true;
  return false;
}

// ---------------------------------------------------------------------------
// FileSessionWriter
// ---------------------------------------------------------------------------

export class FileSessionWriter implements SessionWriter {
  private readonly basePath: string;
  private readonly sessions = new Map<string, ActiveSession>();

  constructor(options?: { basePath?: string }) {
    this.basePath =
      options?.basePath ??
      process.env.SESSION_DATA_DIR ??
      path.join(process.cwd(), 'data', 'sessions');
  }

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  async create(sessionId: string, options?: { parentSessionId?: string }): Promise<void> {
    const now = Date.now();
    const date = toDateString(now);
    const dir = path.join(this.basePath, date);

    await fs.promises.mkdir(dir, { recursive: true });

    const tmpPath = path.join(dir, `${sessionId}.tmp.jsonl`);
    const finalPath = path.join(dir, `${sessionId}.jsonl`);

    // Create the tmp file (truncate if somehow exists)
    await fs.promises.writeFile(tmpPath, '', 'utf-8');

    this.sessions.set(sessionId, {
      sessionId,
      parentSessionId: options?.parentSessionId,
      date,
      tmpPath,
      finalPath,
      startTime: now,
      eventCount: 0,
      messageCount: 0,
    });
  }

  // -----------------------------------------------------------------------
  // append (synchronous — safe to call rapidly from SSE stream handler)
  // -----------------------------------------------------------------------

  append(sessionId: string, event: SessionEvent): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`FileSessionWriter: session "${sessionId}" not created. Call create() first.`);
    }

    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(session.tmpPath, line, 'utf-8');

    session.eventCount++;
    if (isMessageEvent(event)) {
      session.messageCount++;
    }
  }

  // -----------------------------------------------------------------------
  // finalize
  // -----------------------------------------------------------------------

  async finalize(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`FileSessionWriter: session "${sessionId}" not found for finalize.`);
    }

    const now = Date.now();
    const durationMs = now - session.startTime;

    const summary: SessionSummary = {
      id: session.sessionId,
      date: session.date,
      messageCount: session.messageCount,
      eventCount: session.eventCount + 1, // +1 for the session:complete event we're about to write
      durationMs,
      ...(session.parentSessionId ? { parentSessionId: session.parentSessionId } : {}),
    };

    // Append the final session:complete event
    const completeEvent: SessionEvent = {
      type: 'session:complete',
      sessionId: session.sessionId,
      summary,
      timestamp: now,
    };

    const line = JSON.stringify(completeEvent) + '\n';
    fs.appendFileSync(session.tmpPath, line, 'utf-8');

    // Atomic rename: .tmp.jsonl -> .jsonl
    await fs.promises.rename(session.tmpPath, session.finalPath);

    // Clean up in-memory tracking
    this.sessions.delete(sessionId);
  }

  // -----------------------------------------------------------------------
  // read
  // -----------------------------------------------------------------------

  async *read(sessionId: string): AsyncIterable<SessionEvent> {
    const filePath = await this.findSessionFile(sessionId);
    if (!filePath) {
      throw new Error(`FileSessionWriter: session file not found for "${sessionId}".`);
    }

    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      yield JSON.parse(trimmed) as SessionEvent;
    }
  }

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------

  async list(options?: SessionListOptions): Promise<SessionListResult> {
    const limit = options?.limit ?? 20;
    const cursor = options?.cursor;
    const dateFilter = options?.date;

    // Collect date directories to scan
    let dateDirs: string[];
    if (dateFilter) {
      dateDirs = [dateFilter];
    } else {
      try {
        const entries = await fs.promises.readdir(this.basePath);
        // Sort descending (newest first)
        dateDirs = entries
          .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e))
          .sort()
          .reverse();
      } catch {
        // basePath doesn't exist yet — no sessions
        return { sessions: [] };
      }
    }

    // Collect all session summaries across matching directories
    const allSummaries: SessionSummary[] = [];

    for (const dateDir of dateDirs) {
      const dirPath = path.join(this.basePath, dateDir);
      let files: string[];
      try {
        files = await fs.promises.readdir(dirPath);
      } catch {
        continue; // directory doesn't exist for this date
      }

      // Only finalized sessions (.jsonl, not .tmp.jsonl)
      const sessionFiles = files
        .filter((f) => f.endsWith('.jsonl') && !f.endsWith('.tmp.jsonl'))
        .sort()
        .reverse();

      for (const file of sessionFiles) {
        const sessionId = file.replace(/\.jsonl$/, '');
        const summary = await this.extractSummary(path.join(dirPath, file), sessionId, dateDir);
        allSummaries.push(summary);
      }
    }

    // Apply cursor-based pagination (cursor = sessionId to start after)
    let startIndex = 0;
    if (cursor) {
      const idx = allSummaries.findIndex((s) => s.id === cursor);
      if (idx >= 0) {
        startIndex = idx + 1;
      }
    }

    const page = allSummaries.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < allSummaries.length;

    return {
      sessions: page,
      nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Find the session file on disk. Checks both .jsonl (finalized) and
   * .tmp.jsonl (in-progress) across all date directories.
   */
  private async findSessionFile(sessionId: string): Promise<string | null> {
    // Check in-memory sessions first (active/unfinalized)
    const active = this.sessions.get(sessionId);
    if (active) {
      try {
        await fs.promises.access(active.tmpPath);
        return active.tmpPath;
      } catch {
        // fall through
      }
    }

    // Scan date directories
    let dateDirs: string[];
    try {
      dateDirs = await fs.promises.readdir(this.basePath);
    } catch {
      return null;
    }

    for (const dateDir of dateDirs) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDir)) continue;
      const dirPath = path.join(this.basePath, dateDir);

      // Prefer finalized file
      const finalPath = path.join(dirPath, `${sessionId}.jsonl`);
      try {
        await fs.promises.access(finalPath);
        return finalPath;
      } catch {
        // try tmp
      }

      const tmpPath = path.join(dirPath, `${sessionId}.tmp.jsonl`);
      try {
        await fs.promises.access(tmpPath);
        return tmpPath;
      } catch {
        // not in this directory
      }
    }

    return null;
  }

  /**
   * Extract a SessionSummary from a finalized JSONL file.
   * Reads the last line first (should be session:complete with embedded summary).
   * Falls back to a minimal summary from the filename if parsing fails.
   */
  private async extractSummary(
    filePath: string,
    sessionId: string,
    date: string,
  ): Promise<SessionSummary> {
    try {
      // Read the last non-empty line of the file
      const lastLine = await this.readLastLine(filePath);
      if (lastLine) {
        const event = JSON.parse(lastLine);
        if (event.type === 'session:complete' && event.summary) {
          return event.summary as SessionSummary;
        }
      }
    } catch {
      // Fall through to minimal summary
    }

    // Minimal fallback summary
    return {
      id: sessionId,
      date,
      messageCount: 0,
      eventCount: 0,
      durationMs: 0,
    };
  }

  /**
   * Read the last non-empty line of a file efficiently.
   * Reads the final chunk (up to 4KB) and extracts the last line.
   */
  private async readLastLine(filePath: string): Promise<string | null> {
    const stat = await fs.promises.stat(filePath);
    if (stat.size === 0) return null;

    const chunkSize = Math.min(4096, stat.size);
    const buffer = Buffer.alloc(chunkSize);

    const fd = await fs.promises.open(filePath, 'r');
    try {
      await fd.read(buffer, 0, chunkSize, stat.size - chunkSize);
      const content = buffer.toString('utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      return lines.length > 0 ? lines[lines.length - 1] : null;
    } finally {
      await fd.close();
    }
  }
}
