import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import {
  listTournaments,
  loadTournamentDetail,
  loadEncounterTraces,
} from '@/lib/tournament-loader';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function genLine(gen: number, agents: any[], fitness: any[], opts: any = {}) {
  return JSON.stringify({
    type: 'generation',
    generation: gen,
    populationSize: agents.length,
    agents,
    fitness,
    survivors: opts.survivors ?? agents.map((a: any) => a.id),
    mutations: opts.mutations ?? [],
    crossovers: opts.crossovers ?? [],
    durationMs: opts.durationMs ?? 100,
  });
}

function completeLine(overrides: any = {}) {
  return JSON.stringify({
    type: 'tournament_complete',
    tournamentId: overrides.tournamentId ?? 'tid-1',
    generationsRun: overrides.generationsRun ?? 1,
    bestFitness: overrides.bestFitness ?? 0.75,
    winnerId: overrides.winnerId ?? 'a1',
    winnerTools: overrides.winnerTools ?? ['inspect', 'act'],
    winnerOrigin: overrides.winnerOrigin ?? 'seed',
    startedAt: overrides.startedAt ?? '2026-01-15T10:00:00Z',
    completedAt: overrides.completedAt ?? '2026-01-15T10:05:00Z',
  });
}

const agent1 = { id: 'a1', tools: ['inspect', 'act'], origin: 'seed', parentIds: [], identity: 'h1' };
const fitness1 = {
  agentId: 'a1',
  fitnessScore: 0.75,
  taskResults: [
    { encounterId: 'e1', resolved: true, score: 0.8, stepCount: 3, died: false, costEstimate: 0.001 },
  ],
  metrics: { completionRate: 1, meanScore: 0.8, meanSteps: 3, survivalRate: 1, totalCost: 0.001, meanCollateral: 0 },
};

// ---------------------------------------------------------------------------
// listTournaments
// ---------------------------------------------------------------------------

describe('listTournaments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when tournaments dir does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(listTournaments('/data')).toEqual([]);
  });

  it('returns empty array when dir exists but is empty', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([]);
    expect(listTournaments('/data')).toEqual([]);
  });

  it('returns tournament summaries sorted by date descending', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['tid-1', 'tid-2']);
    mockStatSync.mockImplementation((p: string) => {
      if (p.includes('tid-1')) return { isDirectory: () => true, mtimeMs: 1000 };
      if (p.includes('tid-2')) return { isDirectory: () => true, mtimeMs: 2000 };
      return { isDirectory: () => false, mtimeMs: 0 };
    });
    // tid-1 has complete data
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.includes('tid-1')) {
        return [
          genLine(0, [agent1], [fitness1]),
          completeLine({ tournamentId: 'tid-1', startedAt: '2026-01-15T10:00:00Z' }),
        ].join('\n') + '\n';
      }
      if (p.includes('tid-2')) {
        const agent2 = { ...agent1, id: 'b1', tools: ['search', 'model'] };
        const fitness2 = { ...fitness1, agentId: 'b1', fitnessScore: 0.9 };
        return [
          genLine(0, [agent2], [fitness2]),
          completeLine({ tournamentId: 'tid-2', bestFitness: 0.9, winnerId: 'b1', winnerTools: ['search', 'model'], startedAt: '2026-01-16T10:00:00Z' }),
        ].join('\n') + '\n';
      }
      return '';
    });

    const result = listTournaments('/data');
    expect(result).toHaveLength(2);
    // tid-2 is more recent (higher mtimeMs)
    expect(result[0].id).toBe('tid-2');
    expect(result[0].bestFitness).toBe(0.9);
    expect(result[0].winnerTools).toEqual(['search', 'model']);
    expect(result[1].id).toBe('tid-1');
    expect(result[1].bestFitness).toBe(0.75);
  });

  it('skips non-directory entries', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['tid-1', 'random-file.txt']);
    mockStatSync.mockImplementation((p: string) => {
      if (p.includes('tid-1')) return { isDirectory: () => true, mtimeMs: 1000 };
      return { isDirectory: () => false, mtimeMs: 0 };
    });
    mockReadFileSync.mockReturnValue(
      [genLine(0, [agent1], [fitness1]), completeLine()].join('\n') + '\n'
    );

    const result = listTournaments('/data');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('tid-1');
  });

  it('includes incomplete tournaments with status interrupted', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['tid-1']);
    mockStatSync.mockReturnValue({ isDirectory: () => true, mtimeMs: 1000 });
    // No tournament_complete line
    mockReadFileSync.mockReturnValue(genLine(0, [agent1], [fitness1]) + '\n');

    const result = listTournaments('/data');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('interrupted');
    expect(result[0].completedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadTournamentDetail
// ---------------------------------------------------------------------------

describe('loadTournamentDetail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when tournament dir does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(loadTournamentDetail('/data', 'tid-1')).toBeNull();
  });

  it('loads full tournament detail with generations and completion', () => {
    mockExistsSync.mockReturnValue(true);
    const content = [
      genLine(0, [agent1], [fitness1]),
      genLine(1, [agent1], [{ ...fitness1, fitnessScore: 0.85 }]),
      completeLine({ generationsRun: 2, bestFitness: 0.85 }),
    ].join('\n') + '\n';
    mockReadFileSync.mockReturnValue(content);

    const detail = loadTournamentDetail('/data', 'tid-1');
    expect(detail).not.toBeNull();
    expect(detail!.generations).toHaveLength(2);
    expect(detail!.generations[0].generation).toBe(0);
    expect(detail!.generations[1].generation).toBe(1);
    expect(detail!.complete).not.toBeNull();
    expect(detail!.complete!.bestFitness).toBe(0.85);
  });

  it('returns detail without complete when tournament was interrupted', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(genLine(0, [agent1], [fitness1]) + '\n');

    const detail = loadTournamentDetail('/data', 'tid-1');
    expect(detail).not.toBeNull();
    expect(detail!.generations).toHaveLength(1);
    expect(detail!.complete).toBeNull();
  });

  it('includes fitness taskResults in generation data', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      genLine(0, [agent1], [fitness1]) + '\n' + completeLine() + '\n'
    );

    const detail = loadTournamentDetail('/data', 'tid-1');
    const fit = detail!.generations[0].fitness[0];
    expect(fit.taskResults).toBeDefined();
    expect(fit.taskResults).toHaveLength(1);
    expect(fit.taskResults![0].encounterId).toBe('e1');
    expect(fit.taskResults![0].score).toBe(0.8);
  });
});

// ---------------------------------------------------------------------------
// loadEncounterTraces
// ---------------------------------------------------------------------------

describe('loadEncounterTraces', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when traces dir does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(loadEncounterTraces('/data', 'tid-1', 'a1')).toEqual([]);
  });

  it('loads trace metadata from JSONL files', () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['e1.jsonl', 'e2.jsonl']);
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.toString().includes('e1.jsonl')) {
        return JSON.stringify({
          type: 'encounter_meta',
          agentId: 'a1',
          encounterId: 'e1',
          resolved: true,
          score: 0.8,
          details: 'good',
          response: 'done',
          stepCount: 3,
          died: false,
          deathCause: null,
          deathDetails: null,
        }) + '\n';
      }
      if (p.toString().includes('e2.jsonl')) {
        return JSON.stringify({
          type: 'encounter_meta',
          agentId: 'a1',
          encounterId: 'e2',
          resolved: false,
          score: 0.2,
          details: 'failed',
          response: 'stuck',
          stepCount: 10,
          died: true,
          deathCause: 'iteration_limit',
          deathDetails: 'Exceeded max steps',
        }) + '\n';
      }
      return '';
    });

    const traces = loadEncounterTraces('/data', 'tid-1', 'a1');
    expect(traces).toHaveLength(2);
    expect(traces[0].encounterId).toBe('e1');
    expect(traces[0].died).toBe(false);
    expect(traces[1].encounterId).toBe('e2');
    expect(traces[1].died).toBe(true);
    expect(traces[1].deathCause).toBe('iteration_limit');
  });
});
