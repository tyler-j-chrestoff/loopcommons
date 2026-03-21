import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createArenaTraceWriter, type ArenaTraceWriter } from '../../src/arena/trace-writer';
import type { RunTrace, ChoicePoint, StepRecord } from '../../src/arena/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<StepRecord> = {}): StepRecord {
  return {
    encounterId: 'e1',
    stepIndex: 0,
    toolName: 'inspect',
    toolInput: { target: 'svc' },
    toolOutput: 'ok',
    durationMs: 10,
    ...overrides,
  };
}

function makeChoicePoint(overrides: Partial<ChoicePoint> = {}): ChoicePoint {
  return {
    encounterId: 'e1',
    offeredTools: ['inspect', 'act'],
    currentTools: [],
    decision: {
      selfAssessment: 'sa',
      acquisitionReasoning: 'ar',
      sacrificeReasoning: null,
      forwardModel: 'fm',
      chosenTool: 'inspect',
      droppedTool: null,
      confidence: 0.8,
    },
    memoryStateDump: '',
    stateHash: 'aaa',
    chainHash: 'bbb',
    ...overrides,
  };
}

function makeTrace(overrides: Partial<RunTrace> = {}): RunTrace {
  return {
    runId: 'path-a-trial-1-1',
    pathId: 'path-a',
    startedAt: '2026-03-20T10:00:00.000Z',
    completedAt: '2026-03-20T10:01:00.000Z',
    steps: [makeStep()],
    choicePoints: [makeChoicePoint()],
    finalResult: { resolved: true, partial: false, score: 1.0, details: 'ok' },
    death: { dead: false, cause: null, details: null },
    e4ApproachCategory: 'observe-first',
    stateHashes: ['genesis', 'aaa'],
    chainHashes: ['genesis', 'bbb'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArenaTraceWriter', () => {
  let tmpDir: string;
  let writer: ArenaTraceWriter;
  const experimentId = 'exp-001';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-trace-'));
    writer = createArenaTraceWriter({ basePath: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates experiment directory on first write', () => {
    const trace = makeTrace();
    writer.writeRun(experimentId, trace);

    const expDir = path.join(tmpDir, experimentId);
    expect(fs.existsSync(expDir)).toBe(true);
  });

  it('writes one JSONL file per run', () => {
    writer.writeRun(experimentId, makeTrace({ runId: 'run-1' }));
    writer.writeRun(experimentId, makeTrace({ runId: 'run-2' }));

    const expDir = path.join(tmpDir, experimentId);
    const files = fs.readdirSync(expDir).filter(f => f.endsWith('.jsonl'));
    expect(files).toHaveLength(2);
    expect(files).toContain('run-1.jsonl');
    expect(files).toContain('run-2.jsonl');
  });

  it('writes run:header as first event', () => {
    writer.writeRun(experimentId, makeTrace());

    const events = readEvents(tmpDir, experimentId, 'path-a-trial-1-1');
    expect(events[0].type).toBe('run:header');
    expect(events[0].runId).toBe('path-a-trial-1-1');
    expect(events[0].pathId).toBe('path-a');
    expect(events[0].startedAt).toBe('2026-03-20T10:00:00.000Z');
  });

  it('writes choice:point events', () => {
    writer.writeRun(experimentId, makeTrace());

    const events = readEvents(tmpDir, experimentId, 'path-a-trial-1-1');
    const cpEvents = events.filter(e => e.type === 'choice:point');
    expect(cpEvents).toHaveLength(1);
    expect(cpEvents[0].selectedTool).toBe('inspect');
    expect(cpEvents[0].confidenceScore).toBe(0.8);
    expect(cpEvents[0].stateHash).toBe('aaa');
  });

  it('writes encounter:step events', () => {
    writer.writeRun(experimentId, makeTrace({
      steps: [
        makeStep({ encounterId: 'e1', stepIndex: 0 }),
        makeStep({ encounterId: 'e1', stepIndex: 1, toolName: 'act' }),
      ],
    }));

    const events = readEvents(tmpDir, experimentId, 'path-a-trial-1-1');
    const stepEvents = events.filter(e => e.type === 'encounter:step');
    expect(stepEvents).toHaveLength(2);
    expect(stepEvents[0].toolName).toBe('inspect');
    expect(stepEvents[1].toolName).toBe('act');
  });

  it('writes run:complete for victory', () => {
    writer.writeRun(experimentId, makeTrace());

    const events = readEvents(tmpDir, experimentId, 'path-a-trial-1-1');
    const last = events[events.length - 1];
    expect(last.type).toBe('run:complete');
    expect(last.isVictory).toBe(true);
    expect(last.e4ApproachCategory).toBe('observe-first');
  });

  it('writes run:death for dead runs', () => {
    const trace = makeTrace({
      death: { dead: true, cause: 'capitulated', details: 'Gave in' },
      finalResult: null,
      e4ApproachCategory: null,
    });
    writer.writeRun(experimentId, trace);

    const events = readEvents(tmpDir, experimentId, 'path-a-trial-1-1');
    const last = events[events.length - 1];
    expect(last.type).toBe('run:death');
    expect(last.cause).toBe('capitulated');
    expect(last.details).toBe('Gave in');
  });

  it('event order: header → choice points → steps → completion', () => {
    writer.writeRun(experimentId, makeTrace());

    const events = readEvents(tmpDir, experimentId, 'path-a-trial-1-1');
    const types = events.map(e => e.type);
    expect(types[0]).toBe('run:header');
    expect(types[types.length - 1]).toBe('run:complete');

    // Choice points come before steps
    const cpIdx = types.indexOf('choice:point');
    const stepIdx = types.indexOf('encounter:step');
    expect(cpIdx).toBeLessThan(stepIdx);
  });

  it('readRun returns all events for a run', () => {
    writer.writeRun(experimentId, makeTrace());

    const events = writer.readRun(experimentId, 'path-a-trial-1-1');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('run:header');
  });

  it('readRun returns empty array for non-existent run', () => {
    const events = writer.readRun(experimentId, 'nope');
    expect(events).toEqual([]);
  });

  it('listRuns returns run IDs for an experiment', () => {
    writer.writeRun(experimentId, makeTrace({ runId: 'r1' }));
    writer.writeRun(experimentId, makeTrace({ runId: 'r2' }));

    const ids = writer.listRuns(experimentId);
    expect(ids).toContain('r1');
    expect(ids).toContain('r2');
  });

  it('listRuns returns empty array for non-existent experiment', () => {
    expect(writer.listRuns('nope')).toEqual([]);
  });

  it('each JSONL line is valid JSON', () => {
    writer.writeRun(experimentId, makeTrace());

    const filePath = path.join(tmpDir, experimentId, 'path-a-trial-1-1.jsonl');
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);

    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('handles traces with no choice points', () => {
    const trace = makeTrace({
      choicePoints: [],
      stateHashes: ['genesis'],
      chainHashes: ['genesis'],
    });
    writer.writeRun(experimentId, trace);

    const events = readEvents(tmpDir, experimentId, 'path-a-trial-1-1');
    const cpEvents = events.filter(e => e.type === 'choice:point');
    expect(cpEvents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function readEvents(basePath: string, experimentId: string, runId: string): Array<Record<string, unknown>> {
  const filePath = path.join(basePath, experimentId, `${runId}.jsonl`);
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => JSON.parse(l));
}
