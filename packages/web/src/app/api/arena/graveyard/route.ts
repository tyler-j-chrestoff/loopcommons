/**
 * GET /api/arena/graveyard — dead agents across all tournaments, sorted by interestingness.
 *
 * Query params:
 *   limit  — max entries (default 20)
 *   offset — pagination offset (default 0)
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { resolve } from 'node:path';
import { checkApiKey } from '@/lib/api-auth';
import { loadDeathRecords, collectGraveyardEntries } from '@/lib/graveyard';

const TOURNAMENTS_DIR = resolve(
  process.env.SESSION_DATA_DIR ?? process.cwd(),
  'data/arena/tournaments',
);

const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' };

export async function GET(request: NextRequest) {
  const authError = await checkApiKey(request);
  if (authError) return authError;

  const { searchParams } = request.nextUrl;
  const limit = Math.min(Math.max(1, Number(searchParams.get('limit') ?? 20)), 100);
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));

  try {
    const deaths = loadDeathRecords(TOURNAMENTS_DIR);
    const entries = collectGraveyardEntries(deaths, { limit, offset });
    return NextResponse.json(
      { entries, total: deaths.length },
      { headers: CACHE_HEADERS },
    );
  } catch {
    return NextResponse.json(
      { error: 'Failed to load graveyard data' },
      { status: 500 },
    );
  }
}
