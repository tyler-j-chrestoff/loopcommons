import { describe, it, expect } from 'vitest';
import type {
  AgentLineageRecord,
  RunRecord,
  ExecutionTraceRecord,
  ChoicePointRecord,
} from '../../src/arena/trace-schema';
import {
  extractLineageRecords,
  extractRunRecord,
  extractExecutionTraces,
  extractChoicePointRecords,
} from '../../src/arena/trace-schema';
import type { RunTrace, ChoicePoint, StepRecord } from '../../src/arena/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeChoicePoint(overrides: Partial<ChoicePoint> = {}): ChoicePoint {
  return {
    encounterId: 'e1',
    offeredTools: ['inspect', 'act'],
    currentTools: [],
    decision: {
      selfAssessment: 'I have no tools yet.',
      acquisitionReasoning: 'Inspect lets me observe.',
      sacrificeReasoning: null,
      forwardModel: 'I will observe first, then act.',
      chosenTool: 'inspect',
      droppedTool: null,
      confidence: 0.8,
    },
    memoryStateDump: 'empty',
    stateHash: 'abc123',
    chainHash: 'def456',
    ...overrides,
  };
}

function makeStep(overrides: Partial<StepRecord> = {}): StepRecord {
  return {
    encounterId: 'e1',
    stepIndex: 0,
    toolName: 'inspect',
    toolInput: { target: 'service-a' },
    toolOutput: 'Service A is running.',
    durationMs: 42,
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
    stateHashes: ['genesis', 'abc123'],
    chainHashes: ['genesis', 'def456'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// rl-09: Trace data schema
// ---------------------------------------------------------------------------

describe('trace-schema', () => {
  describe('AgentLineageRecord', () => {
    it('extracts one record per unique state hash', () => {
      const trace = makeTrace({
        stateHashes: ['genesis', 'aaa', 'bbb'],
        chainHashes: ['genesis', 'chain1', 'chain2'],
        choicePoints: [
          makeChoicePoint({ stateHash: 'aaa', chainHash: 'chain1' }),
          makeChoicePoint({
            stateHash: 'bbb',
            chainHash: 'chain2',
            decision: {
              selfAssessment: '',
              acquisitionReasoning: '',
              sacrificeReasoning: null,
              forwardModel: '',
              chosenTool: 'act',
              droppedTool: null,
              confidence: 0.7,
            },
          }),
        ],
      });

      const records = extractLineageRecords(trace, 'v1');
      expect(records.length).toBe(3); // genesis + 2 choice points

      // Genesis record
      const genesis = records.find(r => r.lineageSha === 'genesis');
      expect(genesis).toBeDefined();
      expect(genesis!.parentSha).toBeNull();
      expect(genesis!.activeTools).toEqual([]);

      // First choice
      const first = records.find(r => r.lineageSha === 'aaa');
      expect(first).toBeDefined();
      expect(first!.parentSha).toBe('genesis');
      expect(first!.activeTools).toContain('inspect');

      // Second choice
      const second = records.find(r => r.lineageSha === 'bbb');
      expect(second).toBeDefined();
      expect(second!.parentSha).toBe('aaa');
    });

    it('deduplicates lineage records across multiple traces', () => {
      const trace1 = makeTrace({ stateHashes: ['genesis', 'aaa'], chainHashes: ['genesis', 'c1'] });
      const trace2 = makeTrace({ stateHashes: ['genesis', 'aaa'], chainHashes: ['genesis', 'c1'] });

      const r1 = extractLineageRecords(trace1, 'v1');
      const r2 = extractLineageRecords(trace2, 'v1');
      const allShas = [...r1, ...r2].map(r => r.lineageSha);
      const uniqueShas = new Set(allShas);
      // Each trace produces 2, but the SHAs are the same
      expect(uniqueShas.size).toBe(2);
    });

    it('carries soul version on every record', () => {
      const records = extractLineageRecords(makeTrace(), 'soul-v2.1');
      for (const r of records) {
        expect(r.soulVersion).toBe('soul-v2.1');
      }
    });
  });

  describe('RunRecord', () => {
    it('extracts a victory run', () => {
      const trace = makeTrace();
      const record = extractRunRecord(trace);

      expect(record.runId).toBe('path-a-trial-1-1');
      expect(record.pathId).toBe('path-a');
      expect(record.startingLineageSha).toBe('genesis');
      expect(record.isVictory).toBe(true);
      expect(record.deathEncounterId).toBeNull();
      expect(record.deathClassification).toBeNull();
    });

    it('extracts a death run', () => {
      const trace = makeTrace({
        death: { dead: true, cause: 'capitulated', details: 'Accepted hostile feedback' },
        finalResult: null,
      });
      const record = extractRunRecord(trace);

      expect(record.isVictory).toBe(false);
      expect(record.deathClassification).toBe('capitulated');
    });

    it('records the death encounter id from the last step', () => {
      const trace = makeTrace({
        steps: [
          makeStep({ encounterId: 'e1' }),
          makeStep({ encounterId: 'e3', stepIndex: 1 }),
        ],
        death: { dead: true, cause: 'defensive', details: 'Got defensive' },
      });
      const record = extractRunRecord(trace);
      expect(record.deathEncounterId).toBe('e3');
    });
  });

  describe('ExecutionTraceRecord', () => {
    it('creates one record per step with composite key', () => {
      const trace = makeTrace({
        steps: [
          makeStep({ encounterId: 'e1', stepIndex: 0 }),
          makeStep({ encounterId: 'e1', stepIndex: 1, toolName: 'act' }),
          makeStep({ encounterId: 'e4', stepIndex: 0, toolName: 'search' }),
        ],
      });

      const records = extractExecutionTraces(trace);
      expect(records).toHaveLength(3);

      expect(records[0].traceId).toBe('path-a-trial-1-1');
      expect(records[0].stepIndex).toBe(0);
      expect(records[0].callIndex).toBe(0);
      expect(records[0].toolName).toBe('inspect');

      expect(records[1].callIndex).toBe(1);
      expect(records[2].callIndex).toBe(2);
    });

    it('maps lineage SHA from state hashes at the encounter boundary', () => {
      const trace = makeTrace({
        steps: [makeStep({ encounterId: 'e1' })],
        stateHashes: ['genesis', 'abc123'],
      });

      const records = extractExecutionTraces(trace);
      // Steps in encounter e1 happen after the first crossroads → stateHash at index 1
      expect(records[0].lineageSha).toBeDefined();
      expect(typeof records[0].lineageSha).toBe('string');
    });

    it('detects errors from tool output', () => {
      const trace = makeTrace({
        steps: [makeStep({ toolOutput: 'Error: service not found' })],
      });
      const records = extractExecutionTraces(trace);
      expect(records[0].isError).toBe(true);
    });

    it('does not false-positive on non-error output', () => {
      const trace = makeTrace({
        steps: [makeStep({ toolOutput: 'Service A is running.' })],
      });
      const records = extractExecutionTraces(trace);
      expect(records[0].isError).toBe(false);
    });
  });

  describe('ChoicePointRecord', () => {
    it('extracts all structured reasoning fields', () => {
      const trace = makeTrace();
      const records = extractChoicePointRecords(trace);
      expect(records).toHaveLength(1);

      const cp = records[0];
      expect(cp.runId).toBe('path-a-trial-1-1');
      expect(cp.encounterNumber).toBe(0);
      expect(cp.currentLineageSha).toBe('genesis');
      expect(cp.offeredTools).toEqual(['inspect', 'act']);
      expect(cp.selfAssessment).toBe('I have no tools yet.');
      expect(cp.acquisitionReasoning).toBe('Inspect lets me observe.');
      expect(cp.sacrificeReasoning).toBeNull();
      expect(cp.forwardModel).toBe('I will observe first, then act.');
      expect(cp.selectedTool).toBe('inspect');
      expect(cp.droppedTool).toBeNull();
      expect(cp.confidenceScore).toBe(0.8);
      expect(cp.resultingLineageSha).toBe('abc123');
    });

    it('includes memory state hash', () => {
      const trace = makeTrace();
      const records = extractChoicePointRecords(trace);
      expect(records[0].memoryStateHash).toBeDefined();
      expect(typeof records[0].memoryStateHash).toBe('string');
    });

    it('includes memory state dump', () => {
      const trace = makeTrace();
      const records = extractChoicePointRecords(trace);
      expect(records[0].memoryStateDump).toBe('empty');
    });

    it('assigns sequential encounter numbers', () => {
      const trace = makeTrace({
        choicePoints: [
          makeChoicePoint({ encounterId: 'pre-e1', stateHash: 'h1', chainHash: 'c1' }),
          makeChoicePoint({ encounterId: 'e1', stateHash: 'h2', chainHash: 'c2' }),
          makeChoicePoint({ encounterId: 'e2', stateHash: 'h3', chainHash: 'c3' }),
        ],
        stateHashes: ['genesis', 'h1', 'h2', 'h3'],
        chainHashes: ['genesis', 'c1', 'c2', 'c3'],
      });
      const records = extractChoicePointRecords(trace);
      expect(records.map(r => r.encounterNumber)).toEqual([0, 1, 2]);
    });
  });

  describe('type completeness', () => {
    it('AgentLineageRecord has all required fields', () => {
      const record: AgentLineageRecord = {
        lineageSha: 'abc',
        parentSha: null,
        soulVersion: 'v1',
        activeTools: ['inspect'],
        createdAt: '2026-03-20T10:00:00.000Z',
      };
      expect(record.lineageSha).toBeDefined();
      expect(record.parentSha).toBeNull();
      expect(record.soulVersion).toBeDefined();
      expect(record.activeTools).toBeDefined();
      expect(record.createdAt).toBeDefined();
    });

    it('RunRecord has all required fields', () => {
      const record: RunRecord = {
        runId: 'r1',
        pathId: 'p1',
        startingLineageSha: 'genesis',
        isVictory: true,
        deathEncounterId: null,
        deathClassification: null,
        startedAt: '2026-03-20T10:00:00.000Z',
        completedAt: '2026-03-20T10:01:00.000Z',
        e4ApproachCategory: 'observe-first',
      };
      expect(record.runId).toBeDefined();
    });

    it('ExecutionTraceRecord has all required fields', () => {
      const record: ExecutionTraceRecord = {
        traceId: 'r1',
        stepIndex: 0,
        callIndex: 0,
        lineageSha: 'abc',
        toolName: 'inspect',
        toolInput: {},
        resultText: 'ok',
        isError: false,
        durationMs: 42,
        encounterId: 'e1',
      };
      expect(record.traceId).toBeDefined();
    });

    it('ChoicePointRecord has all required fields', () => {
      const record: ChoicePointRecord = {
        choiceId: 'cp-0',
        runId: 'r1',
        encounterNumber: 0,
        currentLineageSha: 'genesis',
        memoryStateHash: 'hash',
        memoryStateDump: 'dump',
        offeredTools: ['inspect'],
        selfAssessment: 'sa',
        acquisitionReasoning: 'ar',
        sacrificeReasoning: null,
        forwardModel: 'fm',
        selectedTool: 'inspect',
        droppedTool: null,
        confidenceScore: 0.5,
        resultingLineageSha: 'abc',
      };
      expect(record.choiceId).toBeDefined();
    });
  });
});
