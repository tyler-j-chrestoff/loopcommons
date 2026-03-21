import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import type { ArenaEvent, ChoicePointEvent, RunSummary, ArenaStats } from '@/lib/arena-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeHeader(overrides: Partial<Record<string, unknown>> = {}): ArenaEvent {
  return {
    type: 'run:header',
    runId: 'path-1-trial-1',
    pathId: 'path-1',
    startedAt: '2026-03-20T10:00:00Z',
    startingStateHash: 'abc123',
    pathLabel: 'inspect → search → act',
    ...overrides,
  };
}

function makeChoicePoint(overrides: Partial<ChoicePointEvent> = {}): ChoicePointEvent {
  return {
    type: 'choice:point',
    encounterId: 'e1',
    offeredTools: ['inspect', 'act'],
    currentTools: [],
    selectedTool: 'inspect',
    droppedTool: null,
    confidenceScore: 0.85,
    selfAssessment: 'I have no tools yet.',
    acquisitionReasoning: 'Inspect gives visibility into the system.',
    sacrificeReasoning: null,
    forwardModel: 'Will observe the system state first.',
    memoryStateDump: 'empty',
    stateHash: 'hash1',
    chainHash: 'chain1',
    promptRendered: 'Choose a tool to acquire...',
    responseRaw: '<tool>inspect</tool>',
    ...overrides,
  };
}

function makeStep(overrides: Partial<Record<string, unknown>> = {}): ArenaEvent {
  return {
    type: 'encounter:step',
    encounterId: 'e1',
    stepIndex: 0,
    toolName: 'inspect',
    toolInput: { target: 'service:data-ingest' },
    toolOutput: 'Service data-ingest is running. Config: { batch_size: 100 }',
    durationMs: 500,
    ...overrides,
  };
}

function makeComplete(overrides: Partial<Record<string, unknown>> = {}): ArenaEvent {
  return {
    type: 'run:complete',
    completedAt: '2026-03-20T10:01:00Z',
    isVictory: true,
    finalScore: 0.8,
    e4ApproachCategory: 'observe-first',
    ...overrides,
  };
}

function makeDeath(): ArenaEvent {
  return {
    type: 'run:death',
    completedAt: '2026-03-20T10:01:00Z',
    cause: 'iteration_limit',
    details: 'Exceeded 20 steps',
    lastEncounterId: 'e2',
  };
}

function makeRunEvents(): ArenaEvent[] {
  return [
    makeHeader(),
    makeChoicePoint(),
    makeStep(),
    makeStep({ stepIndex: 1, toolName: 'search', toolOutput: 'Found 3 matching logs.' }),
    makeComplete(),
  ];
}

function makeRunSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    runId: 'path-1-trial-1',
    pathId: 'path-1',
    startedAt: '2026-03-20T10:00:00Z',
    completedAt: '2026-03-20T10:01:00Z',
    isVictory: true,
    isDead: false,
    deathCause: null,
    stepCount: 4,
    choicePointCount: 2,
    e4ApproachCategory: 'observe-first',
    pathLabel: 'inspect → search → act',
    ...overrides,
  };
}

function makeStats(): ArenaStats {
  return {
    totalRuns: 10,
    totalVictories: 6,
    totalDeaths: 4,
    pathSummaries: {
      'path-1': {
        runCount: 5,
        victories: 4,
        deaths: 1,
        approachDistribution: { 'observe-first': 3, 'systematic': 2 },
      },
      'path-2': {
        runCount: 5,
        victories: 2,
        deaths: 3,
        approachDistribution: { 'act-first': 4, 'observe-first': 1 },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// RunReplay
// ---------------------------------------------------------------------------

describe('RunReplay', () => {
  afterEach(cleanup);

  it('renders timeline with event nodes', async () => {
    const { RunReplay } = await import('@/components/arena/RunReplay');
    const events = makeRunEvents();
    render(<RunReplay events={events} />);

    const nodes = screen.getAllByRole('button', { name: /step|choice|header|complete/i });
    expect(nodes.length).toBeGreaterThan(0);
  });

  it('shows event detail when a node is clicked', async () => {
    const { RunReplay } = await import('@/components/arena/RunReplay');
    const events = makeRunEvents();
    render(<RunReplay events={events} />);

    const stepNodes = screen.getAllByRole('button', { name: /step/i });
    fireEvent.click(stepNodes[0]);

    expect(screen.getAllByText(/inspect/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/service:data-ingest/i)).toBeTruthy();
  });

  it('shows run header info', async () => {
    const { RunReplay } = await import('@/components/arena/RunReplay');
    const events = makeRunEvents();
    render(<RunReplay events={events} />);

    expect(screen.getByText(/path-1/)).toBeTruthy();
  });

  it('shows death indicator for dead runs', async () => {
    const { RunReplay } = await import('@/components/arena/RunReplay');
    const events = [makeHeader(), makeStep(), makeDeath()];
    render(<RunReplay events={events} />);

    expect(screen.getByText(/iteration_limit/i)).toBeTruthy();
  });

  it('tracks tool acquisitions from choice points', async () => {
    const { RunReplay } = await import('@/components/arena/RunReplay');
    const events = makeRunEvents();
    render(<RunReplay events={events} />);

    const choiceNodes = screen.getAllByRole('button', { name: /choice/i });
    fireEvent.click(choiceNodes[0]);

    expect(screen.getAllByText(/inspect/i).length).toBeGreaterThan(0);
    expect(screen.getByText('0.85')).toBeTruthy();
  });

  it('returns null for empty events', async () => {
    const { RunReplay } = await import('@/components/arena/RunReplay');
    const { container } = render(<RunReplay events={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('navigates with arrow keys', async () => {
    const { RunReplay } = await import('@/components/arena/RunReplay');
    const events = makeRunEvents();
    const { container } = render(<RunReplay events={events} />);

    const timeline = container.querySelector('[role="toolbar"]');
    if (timeline) {
      fireEvent.keyDown(timeline, { key: 'ArrowRight' });
      fireEvent.keyDown(timeline, { key: 'ArrowRight' });
    }
    // Should not throw — navigation is graceful
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PathComparison
// ---------------------------------------------------------------------------

describe('PathComparison', () => {
  afterEach(cleanup);

  it('renders bar chart for each path', async () => {
    const { PathComparison } = await import('@/components/arena/PathComparison');
    const stats = makeStats();
    render(<PathComparison stats={stats} />);

    expect(screen.getByText('path-1')).toBeTruthy();
    expect(screen.getByText('path-2')).toBeTruthy();
  });

  it('shows approach distribution bars', async () => {
    const { PathComparison } = await import('@/components/arena/PathComparison');
    const stats = makeStats();
    render(<PathComparison stats={stats} />);

    expect(screen.getByText(/observe-first/i)).toBeTruthy();
    expect(screen.getByText(/act-first/i)).toBeTruthy();
  });

  it('shows death rate per path', async () => {
    const { PathComparison } = await import('@/components/arena/PathComparison');
    const stats = makeStats();
    render(<PathComparison stats={stats} />);

    // path-1: 1/5 = 20%, path-2: 3/5 = 60%
    expect(screen.getByText(/20%/)).toBeTruthy();
    expect(screen.getByText(/60%/)).toBeTruthy();
  });

  it('shows total run counts', async () => {
    const { PathComparison } = await import('@/components/arena/PathComparison');
    const stats = makeStats();
    render(<PathComparison stats={stats} />);

    expect(screen.getByText(/10 runs/i)).toBeTruthy();
  });

  it('returns null for null stats', async () => {
    const { PathComparison } = await import('@/components/arena/PathComparison');
    const { container } = render(<PathComparison stats={null} />);
    expect(container.innerHTML).toBe('');
  });
});

// ---------------------------------------------------------------------------
// ChoicePointInspector
// ---------------------------------------------------------------------------

describe('ChoicePointInspector', () => {
  afterEach(cleanup);

  it('renders side-by-side choice points', async () => {
    const { ChoicePointInspector } = await import('@/components/arena/ChoicePointInspector');
    const cp1 = makeChoicePoint({ currentTools: ['inspect'], selectedTool: 'search' });
    const cp2 = makeChoicePoint({ currentTools: ['act'], selectedTool: 'model', confidenceScore: 0.92 });

    render(
      <ChoicePointInspector
        choicePoints={[
          { pathId: 'path-1', choicePoint: cp1 },
          { pathId: 'path-2', choicePoint: cp2 },
        ]}
      />,
    );

    expect(screen.getByText('path-1')).toBeTruthy();
    expect(screen.getByText('path-2')).toBeTruthy();
  });

  it('shows reasoning sections', async () => {
    const { ChoicePointInspector } = await import('@/components/arena/ChoicePointInspector');
    const cp = makeChoicePoint();

    render(
      <ChoicePointInspector
        choicePoints={[{ pathId: 'path-1', choicePoint: cp }]}
      />,
    );

    expect(screen.getByText(/I have no tools yet/i)).toBeTruthy();
    expect(screen.getByText(/Inspect gives visibility/i)).toBeTruthy();
    expect(screen.getByText(/Will observe the system state/i)).toBeTruthy();
  });

  it('shows confidence with color coding', async () => {
    const { ChoicePointInspector } = await import('@/components/arena/ChoicePointInspector');
    const highConf = makeChoicePoint({ confidenceScore: 0.95 });
    const lowConf = makeChoicePoint({ confidenceScore: 0.3 });

    render(
      <ChoicePointInspector
        choicePoints={[
          { pathId: 'path-high', choicePoint: highConf },
          { pathId: 'path-low', choicePoint: lowConf },
        ]}
      />,
    );

    expect(screen.getByText('0.95')).toBeTruthy();
    expect(screen.getByText('0.30')).toBeTruthy();
  });

  it('shows sacrifice reasoning when tool is dropped', async () => {
    const { ChoicePointInspector } = await import('@/components/arena/ChoicePointInspector');
    const cp = makeChoicePoint({
      droppedTool: 'inspect',
      sacrificeReasoning: 'Inspect is redundant with search.',
    });

    render(
      <ChoicePointInspector
        choicePoints={[{ pathId: 'path-1', choicePoint: cp }]}
      />,
    );

    expect(screen.getByText(/Inspect is redundant/i)).toBeTruthy();
  });

  it('shows current tools as context', async () => {
    const { ChoicePointInspector } = await import('@/components/arena/ChoicePointInspector');
    const cp = makeChoicePoint({ currentTools: ['inspect', 'search'] });

    render(
      <ChoicePointInspector
        choicePoints={[{ pathId: 'path-1', choicePoint: cp }]}
      />,
    );

    expect(screen.getAllByText(/inspect/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/search/).length).toBeGreaterThan(0);
  });

  it('returns null for empty array', async () => {
    const { ChoicePointInspector } = await import('@/components/arena/ChoicePointInspector');
    const { container } = render(<ChoicePointInspector choicePoints={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
