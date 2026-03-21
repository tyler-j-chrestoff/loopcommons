/**
 * GET /api/metrics/arena-tournament — tournament generation data.
 *
 * Reads JSONL generation logs from packages/llm/data/arena/tournament/.
 * Returns parsed generations with fitness scores for visualization.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkApiKey } from '@/lib/api-auth';
import type {
  TournamentGenerationSummary,
  TournamentCompleteSummary,
  TournamentData,
} from '@/lib/arena-types';

const TOURNAMENT_DIR = resolve(process.cwd(), '../../packages/llm/data/arena/tournament');

const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' };

function parseGenerations(): TournamentData {
  const filePath = resolve(TOURNAMENT_DIR, 'generations.jsonl');
  if (!existsSync(filePath)) {
    return { generations: [], complete: null };
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => JSON.parse(l));

  const generations: TournamentGenerationSummary[] = [];
  let complete: TournamentCompleteSummary | null = null;

  for (const line of lines) {
    if (line.type === 'generation') {
      generations.push(line as TournamentGenerationSummary);
    } else if (line.type === 'tournament_complete') {
      complete = line as TournamentCompleteSummary;
    }
  }

  return { generations, complete };
}

export async function GET(request: NextRequest) {
  const authError = await checkApiKey(request);
  if (authError) return authError;

  try {
    const data = parseGenerations();
    return NextResponse.json(data, { headers: CACHE_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to read tournament data' },
      { status: 500 },
    );
  }
}
