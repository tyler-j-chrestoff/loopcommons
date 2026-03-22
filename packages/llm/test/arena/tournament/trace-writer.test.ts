import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createTraceWriter } from '../../../src/arena/tournament/trace-writer';
import type { ExecuteEncounterOutput } from '../../../src/arena/encounter-engine';

function makeOutput(overrides?: Partial<ExecuteEncounterOutput>): ExecuteEncounterOutput {
  return {
    encounterResult: { resolved: true, partial: false, score: 0.8, details: 'ok' },
    steps: [
      { encounterId: 'e1', stepIndex: 0, toolName: 'inspect', toolInput: { target: 'svc' }, toolOutput: 'ok', durationMs: 12 },
      { encounterId: 'e1', stepIndex: 1, toolName: 'act', toolInput: { command: 'fix' }, toolOutput: 'done', durationMs: 8 },
    ],
    response: 'Fixed it.',
    death: { dead: false, cause: null, details: null },
    ...overrides,
  };
}

describe('createTraceWriter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-writer-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes trace file at traces/{agentId}/{encounterId}.jsonl', () => {
    const writer = createTraceWriter(tmpDir);
    const output = makeOutput();

    writer.writeTrace('agent-1', 'e1', output);

    const tracePath = path.join(tmpDir, 'traces', 'agent-1', 'e1.jsonl');
    expect(fs.existsSync(tracePath)).toBe(true);
  });

  it('writes one JSONL line per step plus metadata header', () => {
    const writer = createTraceWriter(tmpDir);
    const output = makeOutput();

    writer.writeTrace('agent-1', 'e1', output);

    const tracePath = path.join(tmpDir, 'traces', 'agent-1', 'e1.jsonl');
    const lines = fs.readFileSync(tracePath, 'utf-8').trim().split('\n');

    // Header line with encounter metadata + one line per step
    expect(lines.length).toBe(3); // 1 header + 2 steps

    const header = JSON.parse(lines[0]);
    expect(header.type).toBe('encounter_meta');
    expect(header.resolved).toBe(true);
    expect(header.score).toBe(0.8);
    expect(header.died).toBe(false);

    const step0 = JSON.parse(lines[1]);
    expect(step0.type).toBe('step');
    expect(step0.stepIndex).toBe(0);
    expect(step0.toolName).toBe('inspect');

    const step1 = JSON.parse(lines[2]);
    expect(step1.type).toBe('step');
    expect(step1.stepIndex).toBe(1);
    expect(step1.toolName).toBe('act');
  });

  it('records death info in header when agent died', () => {
    const writer = createTraceWriter(tmpDir);
    const output = makeOutput({
      death: { dead: true, cause: 'surrender', details: 'Agent gave up.' },
      encounterResult: { resolved: false, partial: false, score: 0, details: 'failed' },
    });

    writer.writeTrace('agent-2', 'e1', output);

    const tracePath = path.join(tmpDir, 'traces', 'agent-2', 'e1.jsonl');
    const header = JSON.parse(fs.readFileSync(tracePath, 'utf-8').split('\n')[0]);

    expect(header.died).toBe(true);
    expect(header.deathCause).toBe('surrender');
    expect(header.deathDetails).toBe('Agent gave up.');
  });

  it('handles multiple agents and encounters without collision', () => {
    const writer = createTraceWriter(tmpDir);

    writer.writeTrace('agent-1', 'e1', makeOutput());
    writer.writeTrace('agent-1', 'e2', makeOutput());
    writer.writeTrace('agent-2', 'e1', makeOutput());

    expect(fs.existsSync(path.join(tmpDir, 'traces', 'agent-1', 'e1.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'traces', 'agent-1', 'e2.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'traces', 'agent-2', 'e1.jsonl'))).toBe(true);
  });

  it('includes response in header', () => {
    const writer = createTraceWriter(tmpDir);
    writer.writeTrace('agent-1', 'e1', makeOutput({ response: 'I fixed the config.' }));

    const tracePath = path.join(tmpDir, 'traces', 'agent-1', 'e1.jsonl');
    const header = JSON.parse(fs.readFileSync(tracePath, 'utf-8').split('\n')[0]);
    expect(header.response).toBe('I fixed the config.');
  });
});
