/**
 * GET /api/sessions — list session summaries with pagination.
 *
 * amyg-32: Read-only session listing endpoint.
 *
 * Query params:
 *   date   — optional YYYY-MM-DD filter
 *   limit  — optional, default 20, max 100
 *   cursor — optional, opaque pagination cursor from a previous response
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { FileSessionWriter } from '@/lib/session/file-session-writer';
import { checkApiKey } from '@/lib/api-auth';

const writer = new FileSessionWriter();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const authError = await checkApiKey(request);
  if (authError) return authError;

  const params = request.nextUrl.searchParams;

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
