import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  checkApiKey: vi.fn().mockResolvedValue(null),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: mockExistsSync,
      readFileSync: mockReadFileSync,
    },
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  };
});

import { GET } from '@/app/api/metrics/arena-tournament/route';

function makeRequest() {
  return new NextRequest(new URL('http://localhost:3000/api/metrics/arena-tournament'));
}

describe('GET /api/metrics/arena-tournament', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty data when no file exists', async () => {
    mockExistsSync.mockReturnValue(false);
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.generations).toEqual([]);
    expect(data.complete).toBeNull();
  });

  it('parses generation JSONL correctly', async () => {
    const genLine = JSON.stringify({
      type: 'generation',
      generation: 0,
      populationSize: 4,
      agents: [{ id: 'a1', tools: ['inspect', 'act'], origin: 'seed', parentIds: [], identity: 'h1' }],
      fitness: [{ agentId: 'a1', fitnessScore: 0.75, metrics: { completionRate: 1, meanScore: 0.8, meanSteps: 3, survivalRate: 1, totalCost: 0.001 } }],
      survivors: ['a1'],
      mutations: [],
      crossovers: [],
      durationMs: 100,
    });
    const completeLine = JSON.stringify({
      type: 'tournament_complete',
      tournamentId: 'test',
      generationsRun: 1,
      bestFitness: 0.75,
      winnerId: 'a1',
      winnerTools: ['inspect', 'act'],
      winnerOrigin: 'seed',
      startedAt: '2026-01-01',
      completedAt: '2026-01-01',
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(`${genLine}\n${completeLine}\n`);

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(data.generations.length).toBe(1);
    expect(data.generations[0].generation).toBe(0);
    expect(data.complete).not.toBeNull();
    expect(data.complete.bestFitness).toBe(0.75);
    expect(data.complete.winnerTools).toEqual(['inspect', 'act']);
  });

  it('sets cache headers', async () => {
    mockExistsSync.mockReturnValue(false);
    const res = await GET(makeRequest());
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=60');
  });
});
