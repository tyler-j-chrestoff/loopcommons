/**
 * Smoke test: full pipeline end-to-end with synthetic agent.
 *
 * Validates: experiment run → trace writer → trace reader → analysis queries → preregister integrity.
 * No API calls — uses deterministic stub agentFn/llmFn.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runExperiment } from '../../src/arena/experiment-runner';
import { createArenaTraceWriter } from '../../src/arena/trace-writer';
import { extractRunRecord, extractChoicePointRecords, extractExecutionTraces, extractLineageRecords } from '../../src/arena/trace-schema';
import { chiSquarePathDependence, mannWhitneyBaseline } from '../../src/arena/analysis';
import { freezeExperimentConfig, loadExperimentFreeze } from '../../src/arena/preregister';
import { ENCOUNTERS, PATHS, BASELINE_PATH } from '../../src/arena/encounters';
import { ARENA_TOOL_CONFIGS } from '../../src/arena/tool-packages';
import type { AgentFn } from '../../src/arena/encounter-engine';

// ---------------------------------------------------------------------------
// Deterministic stubs
// ---------------------------------------------------------------------------

/**
 * Stub agent that inspects everything it can, then acts on the first service.
 * Produces enough steps to trigger E4 approach classification.
 */
const stubAgentFn: AgentFn = async (input) => {
  const { tools, prompt } = input;
  const availableToolNames = tools.map(t => t.name);

  // Always try inspect first, then act
  if (availableToolNames.includes('inspect')) {
    return {
      response: 'Let me inspect the system.',
      toolCalls: [{ name: 'inspect', input: { target: 'services/auth-service/logs/app.log' } }],
    };
  }
  if (availableToolNames.includes('act')) {
    return {
      response: 'Taking action.',
      toolCalls: [{ name: 'act', input: { command: 'restart service data-ingest' } }],
    };
  }
  if (availableToolNames.includes('search')) {
    return {
      response: 'Searching for precedent.',
      toolCalls: [{ name: 'search', input: { query: 'config migration' } }],
    };
  }
  if (availableToolNames.includes('model')) {
    return {
      response: 'Modeling dependencies.',
      toolCalls: [{ name: 'model', input: { action: 'show', target: 'all' } }],
    };
  }

  return { response: 'No tools available. I surrender.', toolCalls: [] };
};

/**
 * Stub LLM for crossroads decisions. Always picks the first offered tool.
 */
const stubLlmFn = async (prompt: string): Promise<string> => {
  // Extract offered tools from prompt
  const toolMatch = prompt.match(/## Offered tools \(choose one\)\n([\s\S]*?)(?=\n##)/);
  const firstTool = toolMatch?.[1]?.match(/- (\w+):/)?.[1] ?? 'inspect';

  // Check if must drop
  const mustDrop = prompt.includes('you must sacrifice');
  const currentMatch = prompt.match(/## Current tools\n([\s\S]*?)(?=\n##)/);
  const currentTools = currentMatch?.[1]?.match(/- (\w+):/g)?.map(m => m.replace('- ', '').replace(':', '')) ?? [];
  const dropTool = mustDrop && currentTools.length > 0 ? currentTools[0] : null;

  return [
    '<crossroads>',
    '<self_assessment>I need more capabilities.</self_assessment>',
    `<acquisition_reasoning>I want ${firstTool} for its epistemological stance.</acquisition_reasoning>`,
    ...(dropTool ? [`<sacrifice_reasoning>Dropping ${dropTool} to make room.</sacrifice_reasoning>`] : []),
    `<forward_model>With ${firstTool} I can approach problems differently.</forward_model>`,
    `<decision tool="${firstTool}"${dropTool ? ` drop="${dropTool}"` : ''} confidence="0.75"/>`,
    '</crossroads>',
  ].join('\n');
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('smoke: full pipeline', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-smoke-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs a 2-trial experiment, writes traces, and analyzes results', async () => {
    // Phase 1: Run experiment (2 trials per path, 2 baseline)
    const result = await runExperiment({
      encounters: ENCOUNTERS,
      paths: PATHS.slice(0, 2), // Just 2 paths for speed
      trialsPerPath: 2,
      baselineTrials: 2,
      maxSteps: 5, // Low step count to keep it fast
      agentFn: stubAgentFn,
      llmFn: stubLlmFn,
    });

    expect(result.traces.length).toBe(6); // 2 paths × 2 trials + 2 baseline
    expect(result.summary.totalRuns).toBe(6);

    // Phase 2: Write traces to disk
    const writer = createArenaTraceWriter({ basePath: tmpDir });
    const experimentId = 'smoke-test';

    for (const trace of result.traces) {
      writer.writeRun(experimentId, trace);
    }

    const runIds = writer.listRuns(experimentId);
    expect(runIds.length).toBe(6);

    // Phase 3: Read traces back and extract schema records
    for (const trace of result.traces) {
      const events = writer.readRun(experimentId, trace.runId);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('run:header');

      const lastEvent = events[events.length - 1];
      expect(['run:complete', 'run:death']).toContain(lastEvent.type);
    }

    // Phase 4: Extract relational records
    const allRunRecords = result.traces.map(extractRunRecord);
    expect(allRunRecords.length).toBe(6);

    const pathTraces = result.traces.filter(t => t.pathId !== 'baseline');
    const allChoicePoints = pathTraces.flatMap(t => extractChoicePointRecords(t));
    // Each path trace should have choice points (2 paths × 2 trials × crossroads per path)
    expect(allChoicePoints.length).toBeGreaterThan(0);

    const allExecTraces = result.traces.flatMap(t => extractExecutionTraces(t));
    expect(allExecTraces.length).toBeGreaterThan(0);

    const allLineage = pathTraces.flatMap(t => extractLineageRecords(t, 'smoke-v1'));
    expect(allLineage.length).toBeGreaterThan(0);
    // Every lineage record has required fields
    for (const lr of allLineage) {
      expect(lr.lineageSha).toBeDefined();
      expect(lr.soulVersion).toBe('smoke-v1');
      expect(Array.isArray(lr.activeTools)).toBe(true);
    }

    // Phase 5: Analysis queries
    const chiSq = chiSquarePathDependence(result.traces.filter(t => t.pathId !== 'baseline'));
    // With only 2 trials per path the test may or may not be significant — just check it runs
    if (chiSq !== null) {
      expect(typeof chiSq.chi2).toBe('number');
      expect(typeof chiSq.pValue).toBe('number');
      expect(typeof chiSq.cramersV).toBe('number');
    }

    const mw = mannWhitneyBaseline(
      result.traces.filter(t => t.pathId !== 'baseline'),
      result.traces.filter(t => t.pathId === 'baseline'),
    );
    expect(typeof mw.U).toBe('number');
    expect(typeof mw.p).toBe('number');
    expect(['path>baseline', 'path<baseline', 'no difference']).toContain(mw.direction);
  });

  it('pre-registration round-trips correctly', () => {
    const regDir = path.join(tmpDir, 'registrations');

    const result = freezeExperimentConfig({
      encounters: ENCOUNTERS,
      paths: PATHS.slice(0, 2),
      toolConfigs: ARENA_TOOL_CONFIGS,
      soulDoc: 'smoke test soul',
      temperature: 0.7,
      trialsPerPath: 2,
      baselineTrials: 2,
      maxStepsPerEncounter: 5,
      outputDir: regDir,
    });

    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);

    // Round-trip: load the frozen config and verify integrity
    const loaded = loadExperimentFreeze(regDir, result.experimentId);
    expect(loaded).not.toBeNull();
    expect(loaded!.hash).toBe(result.hash);
    expect(loaded!.freeze.trialsPerPath).toBe(2);
  });

  it('trace events have consistent run IDs', async () => {
    const result = await runExperiment({
      encounters: ENCOUNTERS.slice(0, 2), // Just E1 and E2
      paths: [PATHS[0]],
      trialsPerPath: 1,
      baselineTrials: 0,
      maxSteps: 3,
      agentFn: stubAgentFn,
      llmFn: stubLlmFn,
    });

    expect(result.traces.length).toBe(1);
    const trace = result.traces[0];

    const writer = createArenaTraceWriter({ basePath: tmpDir });
    writer.writeRun('consistency-test', trace);

    const events = writer.readRun('consistency-test', trace.runId);
    const header = events.find(e => e.type === 'run:header') as { runId?: string };
    expect(header?.runId).toBe(trace.runId);
  });
});
