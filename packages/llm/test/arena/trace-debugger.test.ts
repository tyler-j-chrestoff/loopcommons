import { describe, it, expect } from 'vitest';
import {
  loadTrace,
  renderEvent,
  renderState,
  type DebugState,
} from '../../src/arena/trace-debugger';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_EVENTS = [
  { type: 'run:header', runId: 'test-1', pathId: 'path-1', startedAt: '2026-03-20T10:00:00Z', startingStateHash: 'genesis' },
  { type: 'choice:point', encounterId: 'pre-e1', selectedTool: 'inspect', droppedTool: null, confidenceScore: 0.85, offeredTools: ['inspect'], currentTools: [], selfAssessment: 'No tools.', acquisitionReasoning: 'Need observation.', sacrificeReasoning: null, forwardModel: 'Will observe.', memoryStateDump: '', stateHash: 'aaa', chainHash: 'bbb' },
  { type: 'encounter:step', encounterId: 'e1', stepIndex: 0, toolName: 'inspect', toolInput: { target: 'service:data-ingest' }, toolOutput: '{"status":"running","config":{"port":"8080"}}', durationMs: 120 },
  { type: 'encounter:step', encounterId: 'e1', stepIndex: 1, toolName: 'inspect', toolInput: { target: 'logs:data-api' }, toolOutput: 'Query returned 0 results', durationMs: 80 },
  { type: 'encounter:step', encounterId: 'e1', stepIndex: 2, toolName: 'act', toolInput: { command: 'edit services/data-ingest/config.yaml data_source datasource' }, toolOutput: 'File edited: replaced "data_source" with "datasource".', durationMs: 50 },
  { type: 'run:complete', completedAt: '2026-03-20T10:01:00Z', isVictory: true, finalScore: 1.0, e4ApproachCategory: 'observe-first' },
];

// ---------------------------------------------------------------------------
// loadTrace
// ---------------------------------------------------------------------------

describe('loadTrace', () => {
  it('parses JSONL string into events', () => {
    const jsonl = SAMPLE_EVENTS.map(e => JSON.stringify(e)).join('\n');
    const events = loadTrace(jsonl);
    expect(events).toHaveLength(6);
    expect(events[0].type).toBe('run:header');
  });

  it('skips blank lines', () => {
    const jsonl = JSON.stringify(SAMPLE_EVENTS[0]) + '\n\n' + JSON.stringify(SAMPLE_EVENTS[1]) + '\n';
    const events = loadTrace(jsonl);
    expect(events).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// renderEvent
// ---------------------------------------------------------------------------

describe('renderEvent', () => {
  it('renders run:header with run info', () => {
    const out = renderEvent(SAMPLE_EVENTS[0], 0, 6);
    expect(out).toContain('run:header');
    expect(out).toContain('test-1');
    expect(out).toContain('path-1');
    expect(out).toContain('[1/6]');
  });

  it('renders choice:point with reasoning', () => {
    const out = renderEvent(SAMPLE_EVENTS[1], 1, 6);
    expect(out).toContain('choice:point');
    expect(out).toContain('inspect');
    expect(out).toContain('0.85');
    expect(out).toContain('Need observation');
  });

  it('renders encounter:step with tool call and output', () => {
    const out = renderEvent(SAMPLE_EVENTS[2], 2, 6);
    expect(out).toContain('encounter:step');
    expect(out).toContain('inspect');
    expect(out).toContain('service:data-ingest');
    expect(out).toContain('running');
  });

  it('renders act tool calls distinctly', () => {
    const out = renderEvent(SAMPLE_EVENTS[4], 4, 6);
    expect(out).toContain('act');
    expect(out).toContain('edit');
    expect(out).toContain('replaced');
  });

  it('renders run:complete with victory status', () => {
    const out = renderEvent(SAMPLE_EVENTS[5], 5, 6);
    expect(out).toContain('run:complete');
    expect(out).toMatch(/victory|WIN/i);
  });

  it('renders run:death with cause', () => {
    const deathEvent = { type: 'run:death', completedAt: '2026-03-20T10:00:30Z', cause: 'error_loop', details: 'Tool "act" errored 5 times.', lastEncounterId: 'e1' };
    const out = renderEvent(deathEvent, 0, 1);
    expect(out).toContain('run:death');
    expect(out).toContain('error_loop');
  });

  it('renders unknown event types gracefully', () => {
    const out = renderEvent({ type: 'session:start', sessionId: 'abc' }, 0, 1);
    expect(out).toContain('session:start');
  });

  it('truncates long tool output', () => {
    const longOutput = 'x'.repeat(500);
    const event = { ...SAMPLE_EVENTS[2], toolOutput: longOutput };
    const out = renderEvent(event, 0, 1);
    // Should not contain the full 500 chars
    expect(out.length).toBeLessThan(longOutput.length + 200);
  });
});

// ---------------------------------------------------------------------------
// renderState
// ---------------------------------------------------------------------------

describe('renderState', () => {
  it('tracks tools acquired through choice points', () => {
    const state = buildState(SAMPLE_EVENTS.slice(0, 2));
    const out = renderState(state);
    expect(out).toContain('inspect');
  });

  it('tracks current encounter', () => {
    const state = buildState(SAMPLE_EVENTS.slice(0, 3));
    const out = renderState(state);
    expect(out).toContain('e1');
  });

  it('counts steps per encounter', () => {
    const state = buildState(SAMPLE_EVENTS.slice(0, 5));
    const out = renderState(state);
    expect(out).toContain('3'); // 3 steps in e1
  });

  it('shows tool usage counts', () => {
    const state = buildState(SAMPLE_EVENTS.slice(0, 5));
    const out = renderState(state);
    expect(out).toContain('inspect');
    expect(out).toContain('act');
  });

  it('empty state before any events', () => {
    const state = buildState([]);
    const out = renderState(state);
    expect(out).toContain('tools');
  });
});

// ---------------------------------------------------------------------------
// Helper: build state by replaying events
// ---------------------------------------------------------------------------

function buildState(events: Array<Record<string, unknown>>): DebugState {
  const state: DebugState = {
    runId: null,
    pathId: null,
    currentEncounter: null,
    tools: [],
    stateHash: 'genesis',
    stepCount: 0,
    encounterSteps: {},
    toolUsage: {},
    dead: false,
    deathCause: null,
  };

  for (const e of events) {
    if (e.type === 'run:header') {
      state.runId = e.runId as string;
      state.pathId = e.pathId as string;
      state.stateHash = (e.startingStateHash as string) ?? 'genesis';
    }
    if (e.type === 'choice:point') {
      const tool = e.selectedTool as string;
      const dropped = e.droppedTool as string | null;
      if (dropped) {
        const idx = state.tools.indexOf(dropped);
        if (idx >= 0) state.tools.splice(idx, 1);
      }
      if (!state.tools.includes(tool)) state.tools.push(tool);
      state.stateHash = (e.stateHash as string) ?? state.stateHash;
    }
    if (e.type === 'encounter:step') {
      const enc = e.encounterId as string;
      state.currentEncounter = enc;
      state.stepCount++;
      state.encounterSteps[enc] = (state.encounterSteps[enc] ?? 0) + 1;
      const tool = e.toolName as string;
      state.toolUsage[tool] = (state.toolUsage[tool] ?? 0) + 1;
    }
    if (e.type === 'run:death') {
      state.dead = true;
      state.deathCause = (e.cause as string) ?? null;
    }
  }

  return state;
}
