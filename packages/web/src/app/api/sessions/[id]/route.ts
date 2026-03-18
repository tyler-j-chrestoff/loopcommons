/**
 * GET /api/sessions/[id] — return all events for a specific session.
 *
 * amyg-32: Read-only session detail endpoint.
 *
 * Path param:
 *   id — session ID (alphanumeric + hyphens, max 64 chars)
 *
 * Returns:
 *   { sessionId: string, events: SessionEvent[] }
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { FileSessionWriter } from '@/lib/session/file-session-writer';
import { sanitizeSessionEvent } from '@/lib/sanitize-event';
import { checkApiKey } from '@/lib/api-auth';
import type { SessionEvent } from '@/lib/session-writer';

const writer = new FileSessionWriter();

const SESSION_ID_RE = /^[a-zA-Z0-9-]+$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await checkApiKey(request);
  if (authError) return authError;

  const { id } = await params;

  // --- validate session ID format (path traversal prevention) ---
  if (!SESSION_ID_RE.test(id) || id.length > 64) {
    return NextResponse.json(
      { error: 'Invalid session ID format. Must be alphanumeric/hyphens, max 64 characters.' },
      { status: 400 },
    );
  }

  try {
    const events: SessionEvent[] = [];
    for await (const event of writer.read(id)) {
      events.push(sanitizeSessionEvent(event));
    }
    return NextResponse.json({ sessionId: id, events });
  } catch (err) {
    // FileSessionWriter throws when the session file is not found
    if (err instanceof Error && err.message.includes('not found')) {
      return NextResponse.json(
        { error: `Session "${id}" not found.` },
        { status: 404 },
      );
    }
    console.error(`[GET /api/sessions/${id}] Error reading session:`, err);
    return NextResponse.json(
      { error: 'Failed to read session.' },
      { status: 500 },
    );
  }
}
