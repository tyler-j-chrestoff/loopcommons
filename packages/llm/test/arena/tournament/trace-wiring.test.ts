import { describe, it, expect, vi } from 'vitest';
import { createTaskBattery } from '../../../src/arena/tournament/task-battery';
import { createTraceWriter } from '../../../src/arena/tournament/trace-writer';
import type { EncounterConfig } from '../../../src/arena/types';
import type { TournamentAgent } from '../../../src/arena/tournament/types';
import type { AgentFn } from '../../../src/arena/encounter-engine';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const mockEncounter: EncounterConfig = {
  id: 'E1',
  name: 'Test',
  setup: () => ({
    files: new Map(),
    services: new Map(),
    incidentDb: [],
    dependencyGraph: {},
    commandLog: [],
  }),
  getPrompt: () => 'Fix it.',
  evaluate: () => ({ resolved: true, partial: false, score: 0.7, details: 'ok' }),
};

const mockAgent: TournamentAgent = {
  id: 'agent-x',
  tools: ['inspect', 'act'],
  memoryState: '[]',
  identity: { commitSha: 'abc', toolCompositionHash: 'h1', derivedPromptHash: 'h1' },
  generation: 0,
  origin: 'seed',
  parentIds: [],
};

describe('trace writer wired through task battery', () => {
  it('persists step traces to disk when battery evaluates an agent', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-wiring-'));

    try {
      const traceWriter = createTraceWriter(tmpDir);

      const agentFn: AgentFn = async ({ tools }) => ({
        response: 'Done.',
        toolCalls: [
          { toolName: 'inspect', input: { target: 'svc' }, output: 'ok' },
          { toolName: 'act', input: { command: 'fix' }, output: 'done' },
        ],
      });

      const battery = createTaskBattery({
        encounters: [mockEncounter, { ...mockEncounter, id: 'E2' }],
        agentFnFactory: () => agentFn,
        maxStepsPerEncounter: 10,
        onEncounterComplete: (agentId, encounterId, output) => {
          traceWriter.writeTrace(agentId, encounterId, output);
        },
      });

      const results = await battery.evaluate(mockAgent);

      // Task results still work correctly
      expect(results).toHaveLength(2);
      expect(results[0].score).toBe(0.7);

      // Trace files were written
      const trace1 = path.join(tmpDir, 'traces', 'agent-x', 'E1.jsonl');
      const trace2 = path.join(tmpDir, 'traces', 'agent-x', 'E2.jsonl');
      expect(fs.existsSync(trace1)).toBe(true);
      expect(fs.existsSync(trace2)).toBe(true);

      // Trace content is valid
      const lines = fs.readFileSync(trace1, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(3); // 1 header + 2 steps
      const header = JSON.parse(lines[0]);
      expect(header.type).toBe('encounter_meta');
      expect(header.score).toBe(0.7);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
