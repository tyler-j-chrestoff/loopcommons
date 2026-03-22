import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { DeathRecord } from '@/lib/graveyard';

const { mockLoadDeathRecords, mockCollectGraveyardEntries } = vi.hoisted(() => ({
  mockLoadDeathRecords: vi.fn(),
  mockCollectGraveyardEntries: vi.fn(),
}));

vi.mock('@/lib/graveyard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/graveyard')>();
  return {
    ...actual,
    loadDeathRecords: mockLoadDeathRecords,
    collectGraveyardEntries: mockCollectGraveyardEntries,
  };
});

vi.mock('@/lib/api-auth', () => ({
  checkApiKey: vi.fn().mockResolvedValue(null),
}));

import { GET } from '@/app/api/arena/graveyard/route';

describe('GET /api/arena/graveyard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty entries when no deaths exist', async () => {
    mockLoadDeathRecords.mockReturnValue([]);
    mockCollectGraveyardEntries.mockReturnValue([]);
    const res = await GET(new NextRequest('http://localhost:3000/api/arena/graveyard'));
    const data = await res.json();
    expect(data.entries).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('returns graveyard entries with total count', async () => {
    const deaths: DeathRecord[] = [
      { agentId: 'a1', tournamentId: 'tid-1', tools: ['inspect'], encounterId: 'e1', score: 0.1, stepCount: 5, deathCause: 'iteration_limit', collateral: 0 },
    ];
    const entries = [{ ...deaths[0], interestingness: 4.5, epitaph: 'test epitaph' }];
    mockLoadDeathRecords.mockReturnValue(deaths);
    mockCollectGraveyardEntries.mockReturnValue(entries);

    const res = await GET(new NextRequest('http://localhost:3000/api/arena/graveyard'));
    const data = await res.json();
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].epitaph).toBe('test epitaph');
    expect(data.total).toBe(1);
  });

  it('passes limit and offset from query params', async () => {
    mockLoadDeathRecords.mockReturnValue([]);
    mockCollectGraveyardEntries.mockReturnValue([]);

    await GET(new NextRequest('http://localhost:3000/api/arena/graveyard?limit=5&offset=10'));

    expect(mockCollectGraveyardEntries).toHaveBeenCalledWith(
      [],
      { limit: 5, offset: 10 },
    );
  });

  it('clamps limit to [1, 100]', async () => {
    mockLoadDeathRecords.mockReturnValue([]);
    mockCollectGraveyardEntries.mockReturnValue([]);

    await GET(new NextRequest('http://localhost:3000/api/arena/graveyard?limit=999'));
    expect(mockCollectGraveyardEntries).toHaveBeenCalledWith([], { limit: 100, offset: 0 });

    await GET(new NextRequest('http://localhost:3000/api/arena/graveyard?limit=-5'));
    expect(mockCollectGraveyardEntries).toHaveBeenCalledWith([], { limit: 1, offset: 0 });
  });

  it('sets cache headers', async () => {
    mockLoadDeathRecords.mockReturnValue([]);
    mockCollectGraveyardEntries.mockReturnValue([]);
    const res = await GET(new NextRequest('http://localhost:3000/api/arena/graveyard'));
    expect(res.headers.get('Cache-Control')).toContain('s-maxage');
  });
});
