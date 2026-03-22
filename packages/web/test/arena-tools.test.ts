import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createArenaQueryPackage } from '../src/tools/arena-query';
import type { TournamentSnapshot } from '../src/lib/tournament-manager';

function makeSnapshot(overrides?: Partial<TournamentSnapshot>): TournamentSnapshot {
  return {
    tournamentId: 't-1',
    status: 'running',
    generation: 2,
    population: [
      { id: 'a1', tools: ['inspect', 'act'] },
      { id: 'a2', tools: ['search', 'model'] },
    ],
    fitness: [
      { agentId: 'a1', fitnessScore: 0.75, taskResults: [] },
      { agentId: 'a2', fitnessScore: 0.6, taskResults: [] },
    ],
    bestFitness: 0.75,
    bestAgent: { id: 'a1', tools: ['inspect', 'act'] },
    startedAt: '2026-01-01T00:00:00Z',
    error: null,
    ...overrides,
  };
}

describe('createArenaQueryPackage', () => {
  let getSnapshot: ReturnType<typeof vi.fn>;
  let getStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getSnapshot = vi.fn().mockReturnValue(makeSnapshot());
    getStatus = vi.fn().mockReturnValue('running');
  });

  it('creates a ToolPackage with 3 tools', () => {
    const pkg = createArenaQueryPackage({ getSnapshot, getStatus } as any);
    expect(pkg.tools).toHaveLength(3);
    expect(pkg.tools.map(t => t.name)).toEqual([
      'queryTournament',
      'listTournaments',
      'compareFitness',
    ]);
  });

  it('has correct metadata', () => {
    const pkg = createArenaQueryPackage({ getSnapshot, getStatus } as any);
    expect(pkg.metadata.name).toBe('arena-query');
    expect(pkg.metadata.sideEffects).toBe(false);
  });

  describe('queryTournament', () => {
    it('returns current tournament state', async () => {
      const pkg = createArenaQueryPackage({ getSnapshot, getStatus } as any);
      const tool = pkg.tools.find(t => t.name === 'queryTournament')!;
      const result = await tool.execute({});
      const data = JSON.parse(result);
      expect(data.tournamentId).toBe('t-1');
      expect(data.generation).toBe(2);
      expect(data.bestFitness).toBe(0.75);
    });

    it('returns leaderboard sorted by fitness', async () => {
      const pkg = createArenaQueryPackage({ getSnapshot, getStatus } as any);
      const tool = pkg.tools.find(t => t.name === 'queryTournament')!;
      const result = await tool.execute({ view: 'leaderboard' });
      const data = JSON.parse(result);
      expect(data.leaderboard[0].agentId).toBe('a1');
      expect(data.leaderboard[0].fitnessScore).toBe(0.75);
    });

    it('reports idle when no tournament', async () => {
      getStatus.mockReturnValue('idle');
      getSnapshot.mockReturnValue({ ...makeSnapshot(), tournamentId: null, status: 'idle' });
      const pkg = createArenaQueryPackage({ getSnapshot, getStatus } as any);
      const tool = pkg.tools.find(t => t.name === 'queryTournament')!;
      const result = await tool.execute({});
      const data = JSON.parse(result);
      expect(data.status).toBe('idle');
    });
  });

  describe('listTournaments', () => {
    it('returns current tournament info', async () => {
      const pkg = createArenaQueryPackage({ getSnapshot, getStatus } as any);
      const tool = pkg.tools.find(t => t.name === 'listTournaments')!;
      const result = await tool.execute({});
      const data = JSON.parse(result);
      expect(data.tournaments).toHaveLength(1);
      expect(data.tournaments[0].tournamentId).toBe('t-1');
    });

    it('returns empty list when idle', async () => {
      getStatus.mockReturnValue('idle');
      getSnapshot.mockReturnValue({ ...makeSnapshot(), tournamentId: null, status: 'idle' });
      const pkg = createArenaQueryPackage({ getSnapshot, getStatus } as any);
      const tool = pkg.tools.find(t => t.name === 'listTournaments')!;
      const result = await tool.execute({});
      const data = JSON.parse(result);
      expect(data.tournaments).toHaveLength(0);
    });
  });

  describe('compareFitness', () => {
    it('compares two compositions', async () => {
      const pkg = createArenaQueryPackage({ getSnapshot, getStatus } as any);
      const tool = pkg.tools.find(t => t.name === 'compareFitness')!;
      const result = await tool.execute({
        composition1: ['inspect', 'act'],
        composition2: ['search', 'model'],
      });
      const data = JSON.parse(result);
      expect(data.comparison).toBeDefined();
      expect(data.comparison[0].tools).toEqual(['inspect', 'act']);
      expect(data.comparison[0].fitnessScore).toBe(0.75);
    });

    it('handles missing compositions', async () => {
      const pkg = createArenaQueryPackage({ getSnapshot, getStatus } as any);
      const tool = pkg.tools.find(t => t.name === 'compareFitness')!;
      const result = await tool.execute({
        composition1: ['inspect'],
        composition2: ['act'],
      });
      const data = JSON.parse(result);
      expect(data.comparison[0].fitnessScore).toBeNull();
    });
  });

  it('formatContext returns arena summary', () => {
    const pkg = createArenaQueryPackage({ getSnapshot, getStatus } as any);
    const ctx = pkg.formatContext();
    expect(ctx).toContain('Arena');
    expect(ctx).toContain('running');
  });
});
