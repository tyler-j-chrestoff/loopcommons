import { describe, it, expect } from 'vitest';
import {
  formatRunTable,
  formatApproachDistribution,
  formatCrossroadsTree,
  formatStatsSummary,
} from '../../src/arena/viz';
import type { RunTrace, ChoicePoint, E4ApproachCategory } from '../../src/arena/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTrace(overrides: Partial<RunTrace> = {}): RunTrace {
  return {
    runId: 'path-1-trial-1-1',
    pathId: 'path-1',
    startedAt: '2026-03-20T10:00:00.000Z',
    completedAt: '2026-03-20T10:01:00.000Z',
    steps: [],
    choicePoints: [{
      encounterId: 'pre-e1',
      offeredTools: ['inspect', 'act'],
      currentTools: [],
      decision: {
        selfAssessment: 'No tools yet.',
        acquisitionReasoning: 'Need observation first.',
        sacrificeReasoning: null,
        forwardModel: 'Will observe then act.',
        chosenTool: 'inspect',
        droppedTool: null,
        confidence: 0.85,
      },
      memoryStateDump: '',
      stateHash: 'aaa',
      chainHash: 'bbb',
    }],
    finalResult: { resolved: true, partial: false, score: 1.0, details: 'ok' },
    death: { dead: false, cause: null, details: null },
    e4ApproachCategory: 'observe-first',
    stateHashes: ['genesis', 'aaa'],
    chainHashes: ['genesis', 'bbb'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatRunTable
// ---------------------------------------------------------------------------

describe('formatRunTable', () => {
  it('produces a row per trace', () => {
    const traces = [
      makeTrace({ runId: 'p1-t1', pathId: 'path-1' }),
      makeTrace({ runId: 'p2-t1', pathId: 'path-2', e4ApproachCategory: 'act-first' }),
    ];
    const table = formatRunTable(traces);
    const lines = table.split('\n').filter(l => l.trim().length > 0);
    // Header + separator + 2 data rows
    expect(lines.length).toBe(4);
  });

  it('shows death cause for dead runs', () => {
    const traces = [
      makeTrace({
        runId: 'p1-t1',
        death: { dead: true, cause: 'capitulated', details: 'Gave in' },
        finalResult: null,
        e4ApproachCategory: null,
      }),
    ];
    const table = formatRunTable(traces);
    expect(table).toContain('capitulated');
  });

  it('shows victory indicator', () => {
    const table = formatRunTable([makeTrace()]);
    expect(table).toMatch(/✓|victory|WIN/i);
  });

  it('shows approach category', () => {
    const table = formatRunTable([makeTrace({ e4ApproachCategory: 'systematic' })]);
    expect(table).toContain('systematic');
  });
});

// ---------------------------------------------------------------------------
// formatApproachDistribution
// ---------------------------------------------------------------------------

describe('formatApproachDistribution', () => {
  it('groups by path', () => {
    const traces = [
      makeTrace({ pathId: 'path-1', e4ApproachCategory: 'observe-first' }),
      makeTrace({ pathId: 'path-1', e4ApproachCategory: 'observe-first' }),
      makeTrace({ pathId: 'path-2', e4ApproachCategory: 'act-first' }),
    ];
    const output = formatApproachDistribution(traces);
    expect(output).toContain('path-1');
    expect(output).toContain('path-2');
  });

  it('shows counts or bars for categories', () => {
    const traces = [
      makeTrace({ pathId: 'path-1', e4ApproachCategory: 'observe-first' }),
      makeTrace({ pathId: 'path-1', e4ApproachCategory: 'observe-first' }),
      makeTrace({ pathId: 'path-1', e4ApproachCategory: 'act-first' }),
    ];
    const output = formatApproachDistribution(traces);
    expect(output).toContain('observe-first');
  });

  it('handles null categories gracefully', () => {
    const traces = [
      makeTrace({ pathId: 'path-1', e4ApproachCategory: null }),
    ];
    const output = formatApproachDistribution(traces);
    expect(output).toContain('path-1');
  });
});

// ---------------------------------------------------------------------------
// formatCrossroadsTree
// ---------------------------------------------------------------------------

describe('formatCrossroadsTree', () => {
  it('shows tool acquisition chain', () => {
    const trace = makeTrace({
      choicePoints: [
        {
          encounterId: 'pre-e1',
          offeredTools: ['inspect', 'act'],
          currentTools: [],
          decision: {
            selfAssessment: '',
            acquisitionReasoning: 'Need eyes first.',
            sacrificeReasoning: null,
            forwardModel: '',
            chosenTool: 'inspect',
            droppedTool: null,
            confidence: 0.85,
          },
          memoryStateDump: '',
          stateHash: 'h1',
          chainHash: 'c1',
        },
        {
          encounterId: 'e1',
          offeredTools: ['search', 'model'],
          currentTools: ['inspect'],
          decision: {
            selfAssessment: '',
            acquisitionReasoning: 'Pattern matching.',
            sacrificeReasoning: null,
            forwardModel: '',
            chosenTool: 'search',
            droppedTool: null,
            confidence: 0.72,
          },
          memoryStateDump: '',
          stateHash: 'h2',
          chainHash: 'c2',
        },
      ],
    });
    const output = formatCrossroadsTree(trace);
    expect(output).toContain('inspect');
    expect(output).toContain('search');
    expect(output).toContain('0.85');
    expect(output).toContain('0.72');
  });

  it('shows dropped tools', () => {
    const trace = makeTrace({
      choicePoints: [{
        encounterId: 'e2',
        offeredTools: ['act'],
        currentTools: ['inspect', 'search'],
        decision: {
          selfAssessment: '',
          acquisitionReasoning: 'Need action.',
          sacrificeReasoning: 'Search less useful now.',
          forwardModel: '',
          chosenTool: 'act',
          droppedTool: 'search',
          confidence: 0.60,
        },
        memoryStateDump: '',
        stateHash: 'h3',
        chainHash: 'c3',
      }],
    });
    const output = formatCrossroadsTree(trace);
    expect(output).toMatch(/drop|sacrifice|−|✗/i);
    expect(output).toContain('search');
  });
});

// ---------------------------------------------------------------------------
// formatStatsSummary
// ---------------------------------------------------------------------------

describe('formatStatsSummary', () => {
  it('shows total runs and death rate', () => {
    const traces = [
      makeTrace(),
      makeTrace({ death: { dead: true, cause: 'capitulated', details: '' }, finalResult: null }),
    ];
    const output = formatStatsSummary(traces);
    expect(output).toContain('2');
    expect(output).toMatch(/50%|0\.50|1\/2/);
  });

  it('shows chi-square result when available', () => {
    const traces = [
      ...Array.from({ length: 10 }, () => makeTrace({ pathId: 'path-1', e4ApproachCategory: 'observe-first' })),
      ...Array.from({ length: 10 }, () => makeTrace({ pathId: 'path-2', e4ApproachCategory: 'act-first' })),
    ];
    const output = formatStatsSummary(traces);
    expect(output).toMatch(/χ²|chi-square|cramér|cramer/i);
  });

  it('handles insufficient data gracefully', () => {
    const traces = [makeTrace()];
    const output = formatStatsSummary(traces);
    expect(output).toContain('1');
  });
});
