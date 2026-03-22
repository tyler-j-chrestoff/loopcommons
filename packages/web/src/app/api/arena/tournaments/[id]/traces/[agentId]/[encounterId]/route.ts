export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { resolve } from 'node:path';
import { checkApiKey } from '@/lib/api-auth';
import { loadEncounterTrace } from '@/lib/tournament-loader';

const TOURNAMENTS_DIR = resolve(
  process.env.SESSION_DATA_DIR ?? process.cwd(),
  'data/arena/tournaments',
);

type RouteContext = { params: Promise<{ id: string; agentId: string; encounterId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const authError = await checkApiKey(request);
  if (authError) return authError;

  const { id, agentId, encounterId } = await context.params;
  const trace = loadEncounterTrace(TOURNAMENTS_DIR, id, agentId, encounterId);

  if (!trace) {
    return NextResponse.json(
      { error: 'Trace not found' },
      { status: 404 },
    );
  }

  return NextResponse.json(trace);
}
