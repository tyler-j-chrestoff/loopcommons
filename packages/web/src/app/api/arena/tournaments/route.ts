/**
 * GET /api/arena/tournaments — list all past tournaments from disk.
 *
 * Returns id, status, generationCount, agentCount, bestFitness, winnerTools
 * for each tournament, sorted by most recent first.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { resolve } from 'node:path';
import { checkApiKey } from '@/lib/api-auth';
import { listTournaments } from '@/lib/tournament-loader';

const TOURNAMENTS_DIR = resolve(
  process.env.SESSION_DATA_DIR ?? process.cwd(),
  'data/arena/tournaments',
);

const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=15' };

export async function GET(request: NextRequest) {
  const authError = await checkApiKey(request);
  if (authError) return authError;

  try {
    const tournaments = listTournaments(TOURNAMENTS_DIR);
    return NextResponse.json(tournaments, { headers: CACHE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: 'Failed to list tournaments' },
      { status: 500 },
    );
  }
}
