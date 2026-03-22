import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExistsSync, mockReadFileSync, mockReaddirSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockReaddirSync: vi.fn(),
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
    },
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync,
  };
});

import { loadDeathRecords } from '@/lib/graveyard';

describe('loadDeathRecords', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when tournaments dir does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([]);
    expect(loadDeathRecords('/data')).toEqual([]);
  });

  it('collects deaths from trace files across tournaments', () => {
    // Tournament dir listing
    mockReaddirSync.mockImplementation((p: string) => {
      if (p === '/data') return ['tid-1'];
      if (p.endsWith('traces')) return ['a1'];
      if (p.endsWith('a1')) return ['e1.jsonl', 'e2.jsonl'];
      return [];
    });

    mockExistsSync.mockReturnValue(true);

    const genLine = JSON.stringify({
      type: 'generation',
      generation: 0,
      agents: [{ id: 'a1', tools: ['inspect', 'act'] }],
    });

    const deadMeta = JSON.stringify({
      type: 'encounter_meta',
      agentId: 'a1',
      encounterId: 'e1',
      score: 0.1,
      stepCount: 5,
      died: true,
      deathCause: 'iteration_limit',
    });

    const aliveMeta = JSON.stringify({
      type: 'encounter_meta',
      agentId: 'a1',
      encounterId: 'e2',
      score: 0.8,
      stepCount: 2,
      died: false,
      deathCause: null,
    });

    mockReadFileSync.mockImplementation((p: string) => {
      if (p.toString().includes('generations.jsonl')) return genLine + '\n';
      if (p.toString().includes('e1.jsonl')) return deadMeta + '\n';
      if (p.toString().includes('e2.jsonl')) return aliveMeta + '\n';
      return '';
    });

    const deaths = loadDeathRecords('/data');
    expect(deaths).toHaveLength(1);
    expect(deaths[0].agentId).toBe('a1');
    expect(deaths[0].tournamentId).toBe('tid-1');
    expect(deaths[0].tools).toEqual(['inspect', 'act']);
    expect(deaths[0].deathCause).toBe('iteration_limit');
    expect(deaths[0].encounterId).toBe('e1');
  });

  it('skips malformed trace files', () => {
    mockReaddirSync.mockImplementation((p: string) => {
      if (p === '/data') return ['tid-1'];
      if (p.endsWith('traces')) return ['a1'];
      if (p.endsWith('a1')) return ['bad.jsonl'];
      return [];
    });
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.toString().includes('generations.jsonl')) return '';
      return 'not valid json';
    });

    expect(loadDeathRecords('/data')).toEqual([]);
  });

  it('defaults deathCause to unknown when null', () => {
    mockReaddirSync.mockImplementation((p: string) => {
      if (p === '/data') return ['tid-1'];
      if (p.endsWith('traces')) return ['a1'];
      if (p.endsWith('a1')) return ['e1.jsonl'];
      return [];
    });
    mockExistsSync.mockReturnValue(true);

    const meta = JSON.stringify({
      type: 'encounter_meta',
      agentId: 'a1',
      encounterId: 'e1',
      score: 0,
      stepCount: 3,
      died: true,
      deathCause: null,
    });

    mockReadFileSync.mockImplementation((p: string) => {
      if (p.toString().includes('generations.jsonl')) return '';
      return meta + '\n';
    });

    const deaths = loadDeathRecords('/data');
    expect(deaths).toHaveLength(1);
    expect(deaths[0].deathCause).toBe('unknown');
  });
});
