/**
 * GET /api/metrics/calibration — calibration iteration history.
 *
 * Reads the auto-calibration JSONL log and returns an array of iterations.
 * Strips commitHash and validationMetrics (internal fields) before returning.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkApiKey } from '@/lib/api-auth';
import type { CalibrationIteration } from '@/lib/types';

const LOG_PATH = resolve(process.cwd(), '../../data/calibration/log.jsonl');

export async function GET(request: NextRequest) {
  const authError = await checkApiKey(request);
  if (authError) return authError;

  if (!existsSync(LOG_PATH)) {
    return NextResponse.json([] as CalibrationIteration[], {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
    });
  }

  try {
    const content = readFileSync(LOG_PATH, 'utf-8');
    const lines = content.split('\n').filter(l => l.length > 0);
    const iterations: CalibrationIteration[] = lines.map(line => {
      const raw = JSON.parse(line);
      return {
        iteration: raw.iteration,
        timestamp: raw.timestamp,
        proposedEdit: raw.proposedEdit ?? null,
        diff: raw.diff ?? null,
        metricsBefore: raw.metricsBefore ?? null,
        metricsAfter: raw.metricsAfter,
        fitnessScore: raw.fitnessScore,
        decision: raw.decision,
      };
    });

    return NextResponse.json(iterations, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('[GET /api/metrics/calibration] Error reading log:', err);
    return NextResponse.json(
      { error: 'Failed to load calibration data.' },
      { status: 500 },
    );
  }
}
