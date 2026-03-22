/**
 * GET /api/arena/tournament/current — get the active/most recent tournament ID.
 *
 * Returns the current tournament snapshot if one exists, or 404 if idle.
 * Used by the arena page to reconnect after reload.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/api-auth';
import { getTournamentManager } from '@/lib/tournament-manager';

export async function GET(request: NextRequest) {
  const authError = await checkApiKey(request);
  if (authError) return authError;

  const manager = getTournamentManager();

  if (manager.getStatus() === 'idle') {
    return NextResponse.json({ active: false }, { status: 404 });
  }

  return NextResponse.json({
    active: true,
    ...manager.getSnapshot(),
  });
}
