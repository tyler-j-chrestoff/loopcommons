/**
 * GET /api/metrics — pipeline accuracy and regime classification metrics.
 *
 * Reads pre-computed metrics from data/warehouse/metrics.json, written by
 * the Dagster pipeline after dbt model materialization.
 * Results are cached for 60 seconds.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkApiKey } from '@/lib/api-auth';

const METRICS_PATH = resolve(process.cwd(), '../../data/warehouse/metrics.json');

export async function GET(request: NextRequest) {
  const authError = checkApiKey(request);
  if (authError) return authError;
  if (!existsSync(METRICS_PATH)) {
    return NextResponse.json(
      { accuracy: null, regime: null },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        },
      },
    );
  }

  try {
    const data = JSON.parse(readFileSync(METRICS_PATH, 'utf-8'));
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
    });
  } catch (err) {
    console.error('[GET /api/metrics] Error reading metrics:', err);
    return NextResponse.json(
      { error: 'Failed to load metrics.' },
      { status: 500 },
    );
  }
}
