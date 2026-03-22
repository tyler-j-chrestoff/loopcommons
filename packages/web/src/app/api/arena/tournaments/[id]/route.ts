/**
 * GET /api/arena/tournaments/:id — full tournament detail.
 *
 * Returns all generations with population, fitness (including taskResults),
 * mutations, crossovers, and completion summary.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { resolve } from 'node:path';
import { checkApiKey } from '@/lib/api-auth';
import { loadTournamentDetail } from '@/lib/tournament-loader';

const TOURNAMENTS_DIR = resolve(
  process.env.SESSION_DATA_DIR ?? process.cwd(),
  'data/arena/tournaments',
);

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const authError = await checkApiKey(request);
  if (authError) return authError;

  const { id } = await context.params;
  const detail = loadTournamentDetail(TOURNAMENTS_DIR, id);

  if (!detail) {
    return NextResponse.json(
      { error: 'Tournament not found' },
      { status: 404 },
    );
  }

  return NextResponse.json(detail);
}
