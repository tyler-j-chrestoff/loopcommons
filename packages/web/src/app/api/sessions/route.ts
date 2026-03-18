/**
 * GET /api/sessions — list session summaries with pagination.
 *
 * amyg-32 + ops-13: Read-only session listing endpoint with thread query.
 *
 * Query params:
 *   date   — optional YYYY-MM-DD filter
 *   limit  — optional, default 20, max 100
 *   cursor — optional, opaque pagination cursor from a previous response
 *   thread — optional session ID; returns all sessions in the thread (walks parentSessionId links)
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { FileSessionWriter } from '@/lib/session/file-session-writer';
import { checkApiKey } from '@/lib/api-auth';
import type { SessionSummary } from '@/lib/session-writer';

const writer = new FileSessionWriter();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SESSION_ID_RE = /^[a-zA-Z0-9-]+$/;

/**
 * Build a thread of linked sessions by walking parentSessionId links.
 * Returns sessions in chronological order (oldest first).
 */
async function buildThread(threadSessionId: string): Promise<SessionSummary[]> {
  // Load all sessions (no pagination — walk the full list in memory)
  const all: SessionSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await writer.list({ limit: 100, cursor });
    all.push(...page.sessions);
    cursor = page.nextCursor;
  } while (cursor);

  // Build a lookup by ID and a child map
  const byId = new Map<string, SessionSummary>();
  const childOf = new Map<string, string[]>(); // parentId -> childIds
  for (const s of all) {
    byId.set(s.id, s);
    if (s.parentSessionId) {
      const siblings = childOf.get(s.parentSessionId) ?? [];
      siblings.push(s.id);
      childOf.set(s.parentSessionId, siblings);
    }
  }

  // Walk backward to find the root of the thread
  let rootId = threadSessionId;
  const visited = new Set<string>();
  while (true) {
    visited.add(rootId);
    const session = byId.get(rootId);
    if (!session?.parentSessionId || visited.has(session.parentSessionId)) break;
    rootId = session.parentSessionId;
  }

  // Walk forward from root to build the chain
  const thread: SessionSummary[] = [];
  const queue = [rootId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const session = byId.get(id);
    if (session) {
      thread.push(session);
      const children = childOf.get(id) ?? [];
      queue.push(...children);
    }
  }

  return thread;
}

export async function GET(request: NextRequest) {
  const authError = await checkApiKey(request);
  if (authError) return authError;

  const params = request.nextUrl.searchParams;

  // --- thread query (takes priority over other params) ---
  const threadId = params.get('thread') ?? undefined;
  if (threadId !== undefined) {
    if (!SESSION_ID_RE.test(threadId) || threadId.length > 64) {
      return NextResponse.json(
        { error: 'Invalid thread session ID format.' },
        { status: 400 },
      );
    }
    try {
      const thread = await buildThread(threadId);
      return NextResponse.json({ thread });
    } catch (err) {
      console.error('[GET /api/sessions?thread] Error building thread:', err);
      return NextResponse.json(
        { error: 'Failed to build session thread.' },
        { status: 500 },
      );
    }
  }

  // --- date validation ---
  const date = params.get('date') ?? undefined;
  if (date !== undefined && !DATE_RE.test(date)) {
    return NextResponse.json(
      { error: 'Invalid date format. Expected YYYY-MM-DD.' },
      { status: 400 },
    );
  }

  // --- limit validation ---
  const rawLimit = params.get('limit');
  let limit = 20;
  if (rawLimit !== null) {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      return NextResponse.json(
        { error: 'limit must be an integer between 1 and 100.' },
        { status: 400 },
      );
    }
    limit = parsed;
  }

  // --- cursor validation (same format as session IDs) ---
  const cursor = params.get('cursor') ?? undefined;
  if (cursor !== undefined && (!/^[a-zA-Z0-9-]+$/.test(cursor) || cursor.length > 64)) {
    return NextResponse.json(
      { error: 'Invalid cursor format.' },
      { status: 400 },
    );
  }

  try {
    const result = await writer.list({ date, limit, cursor });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[GET /api/sessions] Error listing sessions:', err);
    return NextResponse.json(
      { error: 'Failed to list sessions.' },
      { status: 500 },
    );
  }
}
