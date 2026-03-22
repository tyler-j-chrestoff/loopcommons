/**
 * POST /api/arena/tournament — start a new tournament.
 *
 * Accepts optional config overrides (maxGenerations, populationSize, mock).
 * Returns tournamentId immediately. Subscribe to SSE stream for live events.
 * One tournament at a time — returns 409 if one is already running.
 */

export const runtime = 'nodejs';

import * as crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/api-auth';
import { getTournamentManager } from '@/lib/tournament-manager';
import { runTournamentAsync } from '@/lib/tournament-runner';

export async function POST(request: NextRequest) {
  const authError = await checkApiKey(request);
  if (authError) return authError;

  const manager = getTournamentManager();

  if (manager.getStatus() === 'running') {
    return NextResponse.json(
      { error: 'Tournament already running', tournamentId: manager.getTournamentId() },
      { status: 409 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — defaults used
  }

  const tournamentId = crypto.randomUUID();

  try {
    manager.start(tournamentId);
  } catch {
    return NextResponse.json(
      { error: 'Tournament already running' },
      { status: 409 },
    );
  }

  // Fire and forget — tournament runs in background, events flow through manager
  runTournamentAsync({
    tournamentId,
    maxGenerations: typeof body.maxGenerations === 'number' ? body.maxGenerations : 5,
    populationSize: typeof body.populationSize === 'number' ? body.populationSize : 8,
    mock: body.mock === true,
    onEvent: (event) => manager.handleEvent(event),
    onComplete: (trace) => manager.complete(trace),
    onError: (err) => manager.fail(String(err)),
  });

  return NextResponse.json({ tournamentId });
}
