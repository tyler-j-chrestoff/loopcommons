/**
 * GET /api/arena/tournament/[id]/state — tournament state snapshot.
 *
 * Returns current generation, population, fitness leaderboard, mana state.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/api-auth';
import { getTournamentManager } from '@/lib/tournament-manager';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const authError = await checkApiKey(request);
  if (authError) return authError;

  const { id } = await context.params;
  const manager = getTournamentManager();

  if (manager.getTournamentId() !== id) {
    return NextResponse.json(
      { error: 'Tournament not found' },
      { status: 404 },
    );
  }

  return NextResponse.json(manager.getSnapshot());
}
