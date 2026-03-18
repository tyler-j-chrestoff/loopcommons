import * as fs from 'node:fs';
import * as path from 'node:path';

import { auth } from '@/auth';
import { FeedbackPayloadSchema, createFeedbackEvent } from '@/lib/feedback';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const basePath =
  process.env.SESSION_DATA_DIR ?? path.join(process.cwd(), 'data', 'sessions');

/**
 * Find the JSONL file for a session by scanning date directories.
 * Checks both finalized (.jsonl) and in-progress (.tmp.jsonl) files.
 */
async function findSessionFile(sessionId: string): Promise<string | null> {
  let dateDirs: string[];
  try {
    dateDirs = await fs.promises.readdir(basePath);
  } catch {
    return null;
  }

  for (const dateDir of dateDirs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDir)) continue;
    const dirPath = path.join(basePath, dateDir);

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

// ---------------------------------------------------------------------------
// POST /api/feedback
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  // --- Auth check ---
  const session = await auth();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // --- Parse and validate body ---
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const result = FeedbackPayloadSchema.safeParse(body);
  if (!result.success) {
    return Response.json(
      { error: 'Validation failed', details: result.error.flatten() },
      { status: 400 },
    );
  }

  // --- Find session file ---
  const filePath = await findSessionFile(result.data.sessionId);
  if (!filePath) {
    return Response.json(
      { error: `Session not found: ${result.data.sessionId}` },
      { status: 404 },
    );
  }

  // --- Create and write feedback event ---
  const event = createFeedbackEvent(result.data);
  const line = JSON.stringify(event) + '\n';
  await fs.promises.appendFile(filePath, line, 'utf-8');

  return Response.json({ event }, { status: 200 });
}
