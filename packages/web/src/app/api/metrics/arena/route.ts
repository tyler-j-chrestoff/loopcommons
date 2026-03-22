/**
 * GET /api/metrics/arena — arena experiment trace data.
 *
 * Reads JSONL trace files from data/arena/{experiment_id}/.
 * Query params:
 *   - experiment_id (required): experiment to read
 *   - run_id: return full event stream for a single run
 *   - path_id: filter runs by path
 *   - compare: comma-separated run IDs, returns events for each
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { checkApiKey } from '@/lib/api-auth';

const ARENA_BASE = resolve(process.cwd(), '../../packages/llm/data/arena');

const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' };

type TraceEvent = Record<string, unknown> & { type: string };

type RunSummary = {
  runId: string;
  pathId: string;
  startedAt: string;
  completedAt: string | null;
  isVictory: boolean;
  isDead: boolean;
  deathCause: string | null;
  stepCount: number;
  choicePointCount: number;
  e4ApproachCategory: string | null;
  pathLabel: string | null;
};

function parseEvents(content: string): TraceEvent[] {
  return content
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => JSON.parse(l) as TraceEvent);
}

function summarizeRun(events: TraceEvent[]): RunSummary {
  const header = events.find(e => e.type === 'run:header');
  const complete = events.find(e => e.type === 'run:complete');
  const death = events.find(e => e.type === 'run:death');

  return {
    runId: (header?.runId as string) ?? 'unknown',
    pathId: (header?.pathId as string) ?? 'unknown',
    startedAt: (header?.startedAt as string) ?? '',
    completedAt: (complete?.completedAt as string) ?? (death?.completedAt as string) ?? null,
    isVictory: (complete?.isVictory as boolean) ?? false,
    isDead: death !== undefined,
    deathCause: (death?.cause as string) ?? null,
    stepCount: events.filter(e => e.type === 'encounter:step').length,
    choicePointCount: events.filter(e => e.type === 'choice:point').length,
    e4ApproachCategory: (complete?.e4ApproachCategory as string) ?? null,
    pathLabel: (header?.pathLabel as string) ?? null,
  };
}

type PathSummary = {
  runCount: number;
  victories: number;
  deaths: number;
  approachDistribution: Record<string, number>;
};

function computeStats(summaries: RunSummary[]) {
  if (summaries.length === 0) return null;

  const pathSummaries: Record<string, PathSummary> = {};

  for (const run of summaries) {
    if (!pathSummaries[run.pathId]) {
      pathSummaries[run.pathId] = {
        runCount: 0,
        victories: 0,
        deaths: 0,
        approachDistribution: {},
      };
    }
    const ps = pathSummaries[run.pathId];
    ps.runCount++;
    if (run.isVictory) ps.victories++;
    if (run.isDead) ps.deaths++;
    if (run.e4ApproachCategory) {
      ps.approachDistribution[run.e4ApproachCategory] =
        (ps.approachDistribution[run.e4ApproachCategory] ?? 0) + 1;
    }
  }

  return {
    totalRuns: summaries.length,
    totalVictories: summaries.filter(r => r.isVictory).length,
    totalDeaths: summaries.filter(r => r.isDead).length,
    pathSummaries,
  };
}

export async function GET(request: NextRequest) {
  const authError = await checkApiKey(request);
  if (authError) return authError;

  const params = request.nextUrl.searchParams;
  const experimentId = params.get('experiment_id');

  if (!experimentId) {
    return NextResponse.json(
      { error: 'experiment_id query parameter is required' },
      { status: 400 },
    );
  }

  const experimentDir = join(ARENA_BASE, experimentId);
  const runId = params.get('run_id');
  const compare = params.get('compare');

  // Single run: return full event stream
  if (runId) {
    const filePath = join(experimentDir, `${runId}.jsonl`);
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }
    const events = parseEvents(readFileSync(filePath, 'utf-8'));
    return NextResponse.json({ events }, { headers: CACHE_HEADERS });
  }

  // Compare mode: return events for multiple runs
  if (compare) {
    const runIds = compare.split(',').map(id => id.trim());
    const runs = runIds.map(id => {
      const filePath = join(experimentDir, `${id}.jsonl`);
      if (!existsSync(filePath)) return { runId: id, events: [] };
      const events = parseEvents(readFileSync(filePath, 'utf-8'));
      return { ...summarizeRun(events), runId: id, events };
    });
    return NextResponse.json({ runs }, { headers: CACHE_HEADERS });
  }

  // Experiment listing: return run summaries + stats
  if (!existsSync(experimentDir)) {
    return NextResponse.json({ runs: [], stats: null }, { headers: CACHE_HEADERS });
  }

  try {
    const files = readdirSync(experimentDir).filter(f => f.endsWith('.jsonl'));
    const summaries: RunSummary[] = [];

    const pathId = params.get('path_id');

    for (const file of files) {
      const content = readFileSync(join(experimentDir, file), 'utf-8');
      const events = parseEvents(content);
      const summary = summarizeRun(events);

      if (pathId && summary.pathId !== pathId) continue;
      summaries.push(summary);
    }

    return NextResponse.json(
      { runs: summaries, stats: computeStats(summaries) },
      { headers: CACHE_HEADERS },
    );
  } catch (err) {
    console.error('[GET /api/metrics/arena] Error reading traces:', err);
    return NextResponse.json(
      { error: 'Failed to load arena data.' },
      { status: 500 },
    );
  }
}
