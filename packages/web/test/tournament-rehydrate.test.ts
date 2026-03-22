import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockExistsSync, mockReadFileSync, mockReaddirSync, mockStatSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockStatSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: mockExistsSync,
      readFileSync: mockReadFileSync,
      readdirSync: mockReaddirSync,
      statSync: mockStatSync,
    },
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync,
    statSync: mockStatSync,
  };
});

import { getTournamentManager, resetTournamentManager } from '../src/lib/tournament-manager';

describe('Tournament rehydration from disk', () => {
  beforeEach(() => {
    resetTournamentManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetTournamentManager();
  });

  it('starts idle when no tournament directory exists', () => {
    mockExistsSync.mockReturnValue(false);
    const mgr = getTournamentManager();
    expect(mgr.getStatus()).toBe('idle');
  });

  it('rehydrates completed tournament from disk', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['t-abc123']);
    mockStatSync.mockReturnValue({ isDirectory: () => true, mtimeMs: Date.now() });

    const genLine = JSON.stringify({
      type: 'generation',
      generation: 0,
      populationSize: 2,
      agents: [
        { id: 'a1', tools: ['inspect', 'act'] },
        { id: 'a2', tools: ['search', 'model'] },
      ],
      fitness: [
        { agentId: 'a1', fitnessScore: 0.8, metrics: { completionRate: 0.8, meanScore: 0.8, meanSteps: 3, survivalRate: 1, totalCost: 0.01, meanCollateral: 0 } },
        { agentId: 'a2', fitnessScore: 0.5, metrics: { completionRate: 0.5, meanScore: 0.5, meanSteps: 4, survivalRate: 0.5, totalCost: 0.02, meanCollateral: 0 } },
      ],
      survivors: ['a1'],
      mutations: [],
      crossovers: [],
      durationMs: 100,
    });

    const completeLine = JSON.stringify({
      type: 'tournament_complete',
      tournamentId: 't-abc123',
      generationsRun: 1,
      bestFitness: 0.8,
      winnerId: 'a1',
      winnerTools: ['inspect', 'act'],
      winnerOrigin: 'seed',
      startedAt: '2026-01-01',
      completedAt: '2026-01-01',
    });

    mockReadFileSync.mockReturnValue(`${genLine}\n${completeLine}\n`);

    const mgr = getTournamentManager();
    expect(mgr.getStatus()).toBe('complete');
    expect(mgr.getTournamentId()).toBe('t-abc123');

    const snap = mgr.getSnapshot();
    expect(snap.bestFitness).toBe(0.8);
    expect(snap.bestAgent?.tools).toEqual(['inspect', 'act']);
    expect(snap.population).toHaveLength(2);
  });

  it('marks interrupted tournament as error', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['t-interrupted']);
    mockStatSync.mockReturnValue({ isDirectory: () => true, mtimeMs: Date.now() });

    const genLine = JSON.stringify({
      type: 'generation',
      generation: 0,
      populationSize: 2,
      agents: [{ id: 'a1', tools: ['inspect'] }],
      fitness: [{ agentId: 'a1', fitnessScore: 0.3, metrics: {} }],
      survivors: ['a1'],
      mutations: [],
      crossovers: [],
      durationMs: 50,
    });

    mockReadFileSync.mockReturnValue(`${genLine}\n`);

    const mgr = getTournamentManager();
    expect(mgr.getStatus()).toBe('error');
    expect(mgr.getSnapshot().error).toContain('interrupted');
  });

  it('picks most recent tournament directory', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['t-old', 't-new']);
    mockStatSync.mockImplementation((p: string) => {
      const isNew = String(p).includes('t-new');
      return { isDirectory: () => true, mtimeMs: isNew ? 2000 : 1000 };
    });

    const completeLine = JSON.stringify({
      type: 'tournament_complete',
      tournamentId: 't-new',
      generationsRun: 1,
      bestFitness: 0.9,
      winnerId: 'w1',
      winnerTools: ['act', 'search'],
      startedAt: '2026-01-02',
      completedAt: '2026-01-02',
    });

    mockReadFileSync.mockReturnValue(`${completeLine}\n`);

    const mgr = getTournamentManager();
    expect(mgr.getTournamentId()).toBe('t-new');
  });
});
