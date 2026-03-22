import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockListTournaments, mockLoadTournamentDetail } = vi.hoisted(() => ({
  mockListTournaments: vi.fn(),
  mockLoadTournamentDetail: vi.fn(),
}));

vi.mock('@/lib/tournament-loader', () => ({
  listTournaments: mockListTournaments,
  loadTournamentDetail: mockLoadTournamentDetail,
}));

vi.mock('@/lib/api-auth', () => ({
  checkApiKey: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// GET /api/arena/tournaments (list)
// ---------------------------------------------------------------------------

import { GET as listGET } from '@/app/api/arena/tournaments/route';

describe('GET /api/arena/tournaments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no tournaments exist', async () => {
    mockListTournaments.mockReturnValue([]);
    const res = await listGET(new NextRequest('http://localhost:3000/api/arena/tournaments'));
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it('returns tournament summaries', async () => {
    mockListTournaments.mockReturnValue([
      {
        id: 'tid-1',
        status: 'complete',
        generationCount: 3,
        agentCount: 8,
        bestFitness: 0.85,
        winnerId: 'a1',
        winnerTools: ['inspect', 'act'],
        startedAt: '2026-01-15T10:00:00Z',
        completedAt: '2026-01-15T10:05:00Z',
      },
    ]);
    const res = await listGET(new NextRequest('http://localhost:3000/api/arena/tournaments'));
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('tid-1');
    expect(data[0].bestFitness).toBe(0.85);
  });

  it('sets cache headers', async () => {
    mockListTournaments.mockReturnValue([]);
    const res = await listGET(new NextRequest('http://localhost:3000/api/arena/tournaments'));
    expect(res.headers.get('Cache-Control')).toContain('s-maxage');
  });
});

// ---------------------------------------------------------------------------
// GET /api/arena/tournaments/:id (detail)
// ---------------------------------------------------------------------------

import { GET as detailGET } from '@/app/api/arena/tournaments/[id]/route';

describe('GET /api/arena/tournaments/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when tournament does not exist', async () => {
    mockLoadTournamentDetail.mockReturnValue(null);
    const res = await detailGET(
      new NextRequest('http://localhost:3000/api/arena/tournaments/nonexistent'),
      { params: Promise.resolve({ id: 'nonexistent' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns tournament detail with generations', async () => {
    mockLoadTournamentDetail.mockReturnValue({
      id: 'tid-1',
      generations: [
        {
          type: 'generation',
          generation: 0,
          populationSize: 4,
          agents: [{ id: 'a1', tools: ['inspect', 'act'], origin: 'seed', parentIds: [], identity: 'h1' }],
          fitness: [{
            agentId: 'a1',
            fitnessScore: 0.75,
            taskResults: [{ encounterId: 'e1', resolved: true, score: 0.8, stepCount: 3, died: false, costEstimate: 0.001 }],
            metrics: { completionRate: 1, meanScore: 0.8, meanSteps: 3, survivalRate: 1, totalCost: 0.001, meanCollateral: 0 },
          }],
          survivors: ['a1'],
          mutations: [],
          crossovers: [],
          durationMs: 100,
        },
      ],
      complete: {
        type: 'tournament_complete',
        tournamentId: 'tid-1',
        generationsRun: 1,
        bestFitness: 0.75,
        winnerId: 'a1',
        winnerTools: ['inspect', 'act'],
        winnerOrigin: 'seed',
        startedAt: '2026-01-15T10:00:00Z',
        completedAt: '2026-01-15T10:05:00Z',
      },
    });

    const res = await detailGET(
      new NextRequest('http://localhost:3000/api/arena/tournaments/tid-1'),
      { params: Promise.resolve({ id: 'tid-1' }) },
    );
    const data = await res.json();
    expect(data.id).toBe('tid-1');
    expect(data.generations).toHaveLength(1);
    expect(data.complete.bestFitness).toBe(0.75);
  });
});
