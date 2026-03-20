/**
 * GET /api/memory — Admin memory inspection endpoint.
 *
 * Returns the agent's current world-model entries with stats.
 * Auth-gated: requires admin session or X-API-Key.
 * Strips vector fields from response to save bandwidth.
 *
 */

import { NextRequest, NextResponse } from 'next/server';
import { createJsonFilePersistentState } from '@loopcommons/memory';
import type { MemoryType } from '@loopcommons/memory';
import { checkApiKey } from '@/lib/api-auth';

const VALID_TYPES = new Set(['observation', 'learning', 'relationship', 'reflection']);

const memoryDataDir = process.env.MEMORY_DATA_DIR ?? 'data/memory';
const state = createJsonFilePersistentState({
  filePath: `${memoryDataDir}/world-model.json`,
});

export async function GET(request: NextRequest) {
  const authError = await checkApiKey(request);
  if (authError) return authError;

  const url = new URL(request.url);

  // Parse query params
  const typeParam = url.searchParams.get('type');
  const tagsParam = url.searchParams.get('tags');
  const limitParam = url.searchParams.get('limit');
  const includeSupersededParam = url.searchParams.get('includeSuperseded');

  const type = typeParam && VALID_TYPES.has(typeParam) ? (typeParam as MemoryType) : undefined;
  const tags = tagsParam ? tagsParam.split(',').filter(Boolean) : undefined;
  const limit = limitParam ? Math.max(1, Math.min(200, parseInt(limitParam, 10) || 50)) : 50;
  const includeSuperseded = includeSupersededParam === 'true';

  const [entries, stats] = await Promise.all([
    state.recall({ type, tags, limit, includeSuperseded }),
    state.stats(),
  ]);

  // Strip vector fields to save bandwidth (they can be large)
  const sanitizedEntries = entries.map(({ vector, ...rest }) => rest);

  return NextResponse.json({
    entries: sanitizedEntries,
    stats,
  });
}
