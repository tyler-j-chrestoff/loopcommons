import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures these exist before vi.mock factories run
// ---------------------------------------------------------------------------

const { mockExistsSync, mockReadFileSync, mockReaddirSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockReaddirSync: vi.fn(),
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
      readdirSync: mockReaddirSync,
    },
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync,
  };
});

// Import route handler AFTER mocks
import { GET } from '@/app/api/metrics/arena/route';

// ---------------------------------------------------------------------------
// Fixtures — minimal JSONL trace events
// ---------------------------------------------------------------------------

const HEADER_EVENT = {
  type: 'run:header',
  runId: 'path-1-trial-1',
  pathId: 'path-1',
  startedAt: '2026-03-20T10:00:00Z',
  startingStateHash: 'abc123',
  pathLabel: 'inspect → search → act(drop inspect)',
};

const CHOICE_EVENT = {
  type: 'choice:point',
  encounterId: 'e1',
  offeredTools: ['inspect', 'act'],
  currentTools: [],
  selectedTool: 'inspect',
  droppedTool: null,
  confidenceScore: 0.85,
  selfAssessment: 'No tools yet.',
  acquisitionReasoning: 'Inspect gives visibility.',
  sacrificeReasoning: null,
  forwardModel: 'Will observe first.',
  memoryStateDump: 'empty',
  stateHash: 'hash1',
  chainHash: 'chain1',
  promptRendered: 'Choose a tool...',
  responseRaw: '<tool>inspect</tool>',
};

const STEP_EVENT = {
  type: 'encounter:step',
  encounterId: 'e1',
  stepIndex: 0,
  toolName: 'inspect',
  toolInput: { target: 'service:data-ingest' },
  toolOutput: 'Service data-ingest is running.',
  durationMs: 500,
};

const COMPLETE_EVENT = {
  type: 'run:complete',
  completedAt: '2026-03-20T10:01:00Z',
  isVictory: true,
  finalScore: 0.8,
  e4ApproachCategory: 'observe-first',
};

const DEATH_EVENT = {
  type: 'run:death',
  completedAt: '2026-03-20T10:01:00Z',
  cause: 'iteration_limit',
  details: 'Exceeded 20 steps',
  lastEncounterId: 'e2',
};

function makeJsonl(...events: Record<string, unknown>[]): string {
  return events.map(e => JSON.stringify(e)).join('\n');
}

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/metrics/arena');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/metrics/arena', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when experiment_id is missing', async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/experiment_id/i);
  });

  it('returns empty runs array when experiment dir does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    const response = await GET(makeRequest({ experiment_id: 'exp-1' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.runs).toEqual([]);
    expect(data.stats).toBeNull();
  });

  it('lists all runs with summaries for experiment', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['path-1-trial-1.jsonl', 'path-2-trial-1.jsonl']);

    const run1 = makeJsonl(HEADER_EVENT, CHOICE_EVENT, STEP_EVENT, COMPLETE_EVENT);
    const run2Header = { ...HEADER_EVENT, runId: 'path-2-trial-1', pathId: 'path-2' };
    const run2 = makeJsonl(run2Header, STEP_EVENT, DEATH_EVENT);

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('path-1-trial-1')) return run1;
      if (filePath.includes('path-2-trial-1')) return run2;
      return '';
    });

    const response = await GET(makeRequest({ experiment_id: 'exp-1' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.runs).toHaveLength(2);
    expect(data.runs[0].runId).toBe('path-1-trial-1');
    expect(data.runs[0].pathId).toBe('path-1');
    expect(data.runs[0].isVictory).toBe(true);
    expect(data.runs[0].isDead).toBe(false);
    expect(data.runs[0].stepCount).toBe(1);
    expect(data.runs[0].choicePointCount).toBe(1);
    expect(data.runs[1].runId).toBe('path-2-trial-1');
    expect(data.runs[1].isDead).toBe(true);
    expect(data.runs[1].deathCause).toBe('iteration_limit');
  });

  it('returns full event stream for a single run', async () => {
    mockExistsSync.mockReturnValue(true);
    const run = makeJsonl(HEADER_EVENT, CHOICE_EVENT, STEP_EVENT, COMPLETE_EVENT);
    mockReadFileSync.mockReturnValue(run);

    const response = await GET(makeRequest({
      experiment_id: 'exp-1',
      run_id: 'path-1-trial-1',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.events).toHaveLength(4);
    expect(data.events[0].type).toBe('run:header');
    expect(data.events[2].type).toBe('encounter:step');
  });

  it('returns 404 for non-existent run_id', async () => {
    mockExistsSync.mockReturnValue(false);

    const response = await GET(makeRequest({
      experiment_id: 'exp-1',
      run_id: 'nonexistent',
    }));
    expect(response.status).toBe(404);
  });

  it('filters runs by path_id', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['p1-t1.jsonl', 'p2-t1.jsonl']);

    const run1 = makeJsonl({ ...HEADER_EVENT, runId: 'p1-t1', pathId: 'path-1' }, COMPLETE_EVENT);
    const run2 = makeJsonl({ ...HEADER_EVENT, runId: 'p2-t1', pathId: 'path-2' }, COMPLETE_EVENT);

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('p1-t1')) return run1;
      if (filePath.includes('p2-t1')) return run2;
      return '';
    });

    const response = await GET(makeRequest({
      experiment_id: 'exp-1',
      path_id: 'path-1',
    }));
    const data = await response.json();

    expect(data.runs).toHaveLength(1);
    expect(data.runs[0].pathId).toBe('path-1');
  });

  it('returns comparison data for two runs', async () => {
    mockExistsSync.mockReturnValue(true);

    const run1 = makeJsonl(HEADER_EVENT, CHOICE_EVENT, STEP_EVENT, COMPLETE_EVENT);
    const run2Header = { ...HEADER_EVENT, runId: 'path-2-trial-1', pathId: 'path-2' };
    const run2 = makeJsonl(run2Header, STEP_EVENT, DEATH_EVENT);

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('path-1-trial-1')) return run1;
      if (filePath.includes('path-2-trial-1')) return run2;
      return '';
    });

    const response = await GET(makeRequest({
      experiment_id: 'exp-1',
      compare: 'path-1-trial-1,path-2-trial-1',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.runs).toHaveLength(2);
    expect(data.runs[0].events).toBeDefined();
    expect(data.runs[1].events).toBeDefined();
  });

  it('returns path statistics with approach distribution', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['r1.jsonl', 'r2.jsonl', 'r3.jsonl']);

    const makeRun = (id: string, pathId: string, approach: string | null) =>
      makeJsonl(
        { ...HEADER_EVENT, runId: id, pathId },
        { ...COMPLETE_EVENT, e4ApproachCategory: approach },
      );

    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath.includes('r1')) return makeRun('r1', 'path-1', 'observe-first');
      if (filePath.includes('r2')) return makeRun('r2', 'path-1', 'act-first');
      if (filePath.includes('r3')) return makeRun('r3', 'path-2', 'observe-first');
      return '';
    });

    const response = await GET(makeRequest({ experiment_id: 'exp-1' }));
    const data = await response.json();

    expect(data.stats).toBeDefined();
    expect(data.stats.totalRuns).toBe(3);
    expect(data.stats.pathSummaries).toBeDefined();
    expect(data.stats.pathSummaries['path-1'].runCount).toBe(2);
    expect(data.stats.pathSummaries['path-2'].runCount).toBe(1);
  });

  it('returns 403 when auth fails', async () => {
    const { checkApiKey } = await import('@/lib/api-auth');
    const { NextResponse } = await import('next/server');
    vi.mocked(checkApiKey).mockResolvedValueOnce(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const response = await GET(makeRequest({ experiment_id: 'exp-1' }));
    expect(response.status).toBe(403);
  });

  it('sets cache headers', async () => {
    mockExistsSync.mockReturnValue(false);

    const response = await GET(makeRequest({ experiment_id: 'exp-1' }));
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=60');
  });

  it('returns 500 on parse error', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['bad.jsonl']);
    mockReadFileSync.mockReturnValue('not valid json');

    const response = await GET(makeRequest({ experiment_id: 'exp-1' }));
    expect(response.status).toBe(500);
  });
});
