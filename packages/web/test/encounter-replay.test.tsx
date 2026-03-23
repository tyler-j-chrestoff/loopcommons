import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextRequest } from 'next/server';

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// FS mocks (hoisted)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const META_LINE = JSON.stringify({
  type: 'encounter_meta',
  agentId: 'agent-1',
  encounterId: 'e1',
  resolved: false,
  score: 0.3,
  details: 'Root cause not addressed.',
  response: 'Mock resolution applied.',
  stepCount: 2,
  died: true,
  deathCause: 'tool_limit',
  deathDetails: 'Exceeded step limit',
});

const STEP_0 = JSON.stringify({
  type: 'step',
  encounterId: 'e1',
  stepIndex: 0,
  toolName: 'inspect',
  toolInput: { target: 'logs' },
  toolOutput: 'Found errors in service-a',
  durationMs: 120,
});

const STEP_1 = JSON.stringify({
  type: 'step',
  encounterId: 'e1',
  stepIndex: 1,
  toolName: 'act',
  toolInput: { command: 'restart service-a' },
  toolOutput: 'Service restarted.',
  durationMs: 80,
});

const TRACE_JSONL = [META_LINE, STEP_0, STEP_1].join('\n') + '\n';

// ---------------------------------------------------------------------------
// 1. loadEncounterTrace (loader unit)
// ---------------------------------------------------------------------------

import { loadEncounterTrace } from '@/lib/tournament-loader';

describe('loadEncounterTrace', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when trace file does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    const result = loadEncounterTrace('/data', 'tid', 'agent-1', 'e1');
    expect(result).toBeNull();
  });

  it('parses metadata + steps from JSONL', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(TRACE_JSONL);
    const result = loadEncounterTrace('/data', 'tid', 'agent-1', 'e1');
    expect(result).not.toBeNull();
    expect(result!.meta.encounterId).toBe('e1');
    expect(result!.meta.died).toBe(true);
    expect(result!.meta.deathCause).toBe('tool_limit');
    expect(result!.steps).toHaveLength(2);
    expect(result!.steps[0].toolName).toBe('inspect');
    expect(result!.steps[1].toolName).toBe('act');
  });

  it('handles trace with no steps', () => {
    mockExistsSync.mockReturnValue(true);
    const metaOnly = JSON.stringify({
      type: 'encounter_meta',
      agentId: 'a1',
      encounterId: 'e1',
      resolved: true,
      score: 1,
      details: 'Perfect.',
      response: 'Done.',
      stepCount: 0,
      died: false,
      deathCause: null,
      deathDetails: null,
    }) + '\n';
    mockReadFileSync.mockReturnValue(metaOnly);
    const result = loadEncounterTrace('/data', 'tid', 'a1', 'e1');
    expect(result).not.toBeNull();
    expect(result!.steps).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Trace API endpoint
// ---------------------------------------------------------------------------

import { GET } from '@/app/api/arena/tournaments/[id]/traces/[agentId]/[encounterId]/route';

function makeTraceRequest(id: string, agentId: string, encounterId: string) {
  return new NextRequest(
    new URL(`http://localhost:3000/api/arena/tournaments/${id}/traces/${agentId}/${encounterId}`),
  );
}

function makeContext(id: string, agentId: string, encounterId: string) {
  return { params: Promise.resolve({ id, agentId, encounterId }) };
}

describe('GET /api/arena/tournaments/:id/traces/:agentId/:encounterId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when trace does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const res = await GET(
      makeTraceRequest('tid', 'a1', 'e1'),
      makeContext('tid', 'a1', 'e1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns meta + steps when trace exists', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(TRACE_JSONL);
    const res = await GET(
      makeTraceRequest('tid', 'agent-1', 'e1'),
      makeContext('tid', 'agent-1', 'e1'),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.meta.encounterId).toBe('e1');
    expect(data.meta.died).toBe(true);
    expect(data.steps).toHaveLength(2);
    expect(data.steps[0].toolName).toBe('inspect');
  });
});

// ---------------------------------------------------------------------------
// 3. EncounterReplay component
// ---------------------------------------------------------------------------

import { EncounterReplay } from '@/components/arena/EncounterReplay';
import type { EncounterTraceMeta, EncounterTraceStep } from '@/lib/tournament-loader';

const testMeta: EncounterTraceMeta = {
  encounterId: 'e1',
  agentId: 'agent-1',
  resolved: false,
  score: 0.3,
  details: 'Root cause not addressed.',
  response: 'Mock resolution applied.',
  stepCount: 2,
  died: true,
  deathCause: 'tool_limit',
  deathDetails: 'Exceeded step limit',
};

const testSteps: EncounterTraceStep[] = [
  { encounterId: 'e1', stepIndex: 0, toolName: 'inspect', toolInput: { target: 'logs' }, toolOutput: 'Found errors', durationMs: 120 },
  { encounterId: 'e1', stepIndex: 1, toolName: 'act', toolInput: { command: 'restart' }, toolOutput: 'Restarted', durationMs: 80 },
];

describe('EncounterReplay', () => {
  it('renders step timeline with tool names', () => {
    render(<EncounterReplay meta={testMeta} steps={testSteps} />);
    expect(screen.getByText('inspect')).toBeInTheDocument();
    expect(screen.getByText('act')).toBeInTheDocument();
  });

  it('shows death marker when agent died', () => {
    render(<EncounterReplay meta={testMeta} steps={testSteps} />);
    expect(screen.getByText(/tool_limit/)).toBeInTheDocument();
    expect(screen.getByText(/exceeded step limit/i)).toBeInTheDocument();
  });

  it('shows encounter context header', () => {
    render(<EncounterReplay meta={testMeta} steps={testSteps} />);
    expect(screen.getByText('E1')).toBeInTheDocument();
    expect(screen.getByText('0.3')).toBeInTheDocument();
  });

  it('renders empty state when no steps', () => {
    const emptyMeta = { ...testMeta, stepCount: 0, died: false, deathCause: null, deathDetails: null };
    render(<EncounterReplay meta={emptyMeta} steps={[]} />);
    expect(screen.getByText(/no steps/i)).toBeInTheDocument();
  });

  it('expands step detail on click', () => {
    render(<EncounterReplay meta={testMeta} steps={testSteps} />);
    fireEvent.click(screen.getByText('inspect'));
    expect(screen.getByText(/found errors/i)).toBeInTheDocument();
  });

  it('shows score breakdown', () => {
    render(<EncounterReplay meta={testMeta} steps={testSteps} />);
    expect(screen.getByText(/not addressed/i)).toBeInTheDocument();
  });

  it('does not show death marker for surviving agent', () => {
    const aliveMeta = { ...testMeta, died: false, deathCause: null, deathDetails: null };
    render(<EncounterReplay meta={aliveMeta} steps={testSteps} />);
    expect(screen.queryByText(/death/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. EncounterHeatmap onCellClick
// ---------------------------------------------------------------------------

import { EncounterHeatmap } from '@/components/EncounterHeatmap';

const hmAgents = [{ id: 'a1', tools: ['inspect', 'act'] }];
const hmFitness = [{
  agentId: 'a1',
  fitnessScore: 0.8,
  taskResults: [
    { encounterId: 'e1', resolved: true, score: 0.9, stepCount: 3, died: false, costEstimate: 0.001 },
  ],
}];

describe('EncounterHeatmap cell click', () => {
  it('calls onCellClick with agentId and encounterId', () => {
    const onClick = vi.fn();
    render(<EncounterHeatmap agents={hmAgents} fitness={hmFitness} onCellClick={onClick} />);
    fireEvent.click(screen.getByText('0.9'));
    expect(onClick).toHaveBeenCalledWith('a1', 'e1');
  });
});

// ---------------------------------------------------------------------------
// 5. Replay page
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { ReplayPageContent } from '@/components/arena/ReplayPageContent';

const traceResponse = {
  meta: testMeta,
  steps: testSteps,
};

describe('ReplayPageContent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads and renders trace data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => traceResponse,
    });
    render(
      <ReplayPageContent tournamentId="tid" agentId="agent-1" encounterId="e1" />,
    );
    await waitFor(() => {
      expect(screen.getByText('inspect')).toBeInTheDocument();
      expect(screen.getByText('act')).toBeInTheDocument();
    });
  });

  it('shows error on 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Trace not found' }),
    });
    render(
      <ReplayPageContent tournamentId="tid" agentId="a1" encounterId="e99" />,
    );
    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });
  });

  it('has breadcrumb with link to arena', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => traceResponse,
    });
    render(
      <ReplayPageContent tournamentId="tid" agentId="agent-1" encounterId="e1" />,
    );
    await waitFor(() => {
      const arenaLink = screen.getByRole('link', { name: /arena/i });
      expect(arenaLink).toHaveAttribute('href', '/arena');
    });
  });
});
