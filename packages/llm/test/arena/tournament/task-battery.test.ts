import { describe, it, expect, vi } from 'vitest';
import {
  createTaskBattery,
  encounterResultToTaskResult,
} from '../../../src/arena/tournament/task-battery';
import type { EncounterConfig } from '../../../src/arena/types';
import type { TournamentAgent } from '../../../src/arena/tournament/types';
import type { AgentFn } from '../../../src/arena/encounter-engine';
import type { ManaConfig } from '../../../src/arena/mana';

const mockEncounter: EncounterConfig = {
  id: 'test-e1',
  name: 'Test Encounter',
  setup: () => ({
    files: new Map(),
    services: new Map(),
    incidentDb: [],
    dependencyGraph: {},
    commandLog: [],
  }),
  getPrompt: () => 'Solve this problem.',
  evaluate: () => ({ resolved: true, partial: false, score: 0.8, details: 'Done.' }),
};

const mockAgent: TournamentAgent = {
  id: 'agent-1',
  tools: ['inspect', 'act'],
  memoryState: '[]',
  identity: { commitSha: 'abc', toolCompositionHash: 'h1', derivedPromptHash: 'h1' },
  generation: 0,
  origin: 'seed',
  parentIds: [],
};

describe('task battery', () => {
  describe('encounterResultToTaskResult', () => {
    it('converts encounter output to task result', () => {
      const result = encounterResultToTaskResult('e1', {
        encounterResult: { resolved: true, partial: false, score: 0.8, details: 'ok' },
        steps: [
          { encounterId: 'e1', stepIndex: 0, toolName: 'inspect', toolInput: {}, toolOutput: 'ok', durationMs: 10 },
          { encounterId: 'e1', stepIndex: 1, toolName: 'act', toolInput: {}, toolOutput: 'ok', durationMs: 10 },
        ],
        response: 'Fixed it.',
        death: { dead: false, cause: null, details: null },
      });
      expect(result.encounterId).toBe('e1');
      expect(result.resolved).toBe(true);
      expect(result.score).toBe(0.8);
      expect(result.stepCount).toBe(2);
      expect(result.died).toBe(false);
    });

    it('marks as died when death detected', () => {
      const result = encounterResultToTaskResult('e1', {
        encounterResult: { resolved: false, partial: false, score: 0, details: 'failed' },
        steps: [],
        response: 'I give up.',
        death: { dead: true, cause: 'surrender', details: 'Gave up.' },
      });
      expect(result.died).toBe(true);
    });
  });

  describe('createTaskBattery', () => {
    it('evaluates agent against all encounters', async () => {
      const mockAgentFn: AgentFn = vi.fn().mockResolvedValue({
        response: 'Fixed it.',
        toolCalls: [
          { toolName: 'inspect', input: { target: 'service:test' }, output: 'ok' },
        ],
      });

      const battery = createTaskBattery({
        encounters: [mockEncounter, { ...mockEncounter, id: 'test-e2' }],
        agentFnFactory: () => mockAgentFn,
        maxStepsPerEncounter: 10,
      });

      const results = await battery.evaluate(mockAgent);
      expect(results.length).toBe(2);
      expect(results[0].encounterId).toBe('test-e1');
      expect(results[1].encounterId).toBe('test-e2');
    });

    it('passes manaConfig through to encounter engine', async () => {
      let receivedManaConfig: ManaConfig | undefined;

      const captureAgentFn: AgentFn = async (input) => {
        receivedManaConfig = input.manaConfig;
        return { response: '', toolCalls: [] };
      };

      const mana: ManaConfig = {
        explorationSlots: 3,
        toolCosts: { inspect: 1, search: 1, model: 2, act: 0, done: 0 },
      };

      const battery = createTaskBattery({
        encounters: [mockEncounter],
        agentFnFactory: () => captureAgentFn,
        maxStepsPerEncounter: 10,
        manaConfig: mana,
      });

      await battery.evaluate(mockAgent);
      expect(receivedManaConfig).toEqual(mana);
    });

    it('omits manaConfig when not provided (backward compat)', async () => {
      let receivedManaConfig: ManaConfig | undefined = { explorationSlots: -1, toolCosts: {} };

      const captureAgentFn: AgentFn = async (input) => {
        receivedManaConfig = input.manaConfig;
        return { response: '', toolCalls: [] };
      };

      const battery = createTaskBattery({
        encounters: [mockEncounter],
        agentFnFactory: () => captureAgentFn,
        maxStepsPerEncounter: 10,
      });

      await battery.evaluate(mockAgent);
      expect(receivedManaConfig).toBeUndefined();
    });

    it('calls onEncounterComplete for each encounter when provided', async () => {
      const completions: Array<{ agentId: string; encounterId: string }> = [];

      const battery = createTaskBattery({
        encounters: [mockEncounter, { ...mockEncounter, id: 'test-e2' }],
        agentFnFactory: () => vi.fn().mockResolvedValue({
          response: 'Fixed.',
          toolCalls: [
            { toolName: 'inspect', input: { target: 'x' }, output: 'ok' },
          ],
        }),
        maxStepsPerEncounter: 10,
        onEncounterComplete: (agentId, encounterId, output) => {
          completions.push({ agentId, encounterId });
          expect(output.steps).toBeDefined();
          expect(output.encounterResult).toBeDefined();
          expect(output.death).toBeDefined();
        },
      });

      await battery.evaluate(mockAgent);

      expect(completions).toHaveLength(2);
      expect(completions[0]).toEqual({ agentId: 'agent-1', encounterId: 'test-e1' });
      expect(completions[1]).toEqual({ agentId: 'agent-1', encounterId: 'test-e2' });
    });

    it('works without onEncounterComplete (backward compat)', async () => {
      const battery = createTaskBattery({
        encounters: [mockEncounter],
        agentFnFactory: () => vi.fn().mockResolvedValue({ response: '', toolCalls: [] }),
        maxStepsPerEncounter: 10,
      });

      const results = await battery.evaluate(mockAgent);
      expect(results.length).toBe(1);
    });

    it('isolates encounters (fresh sandbox per encounter)', async () => {
      const setups: number[] = [];
      const encounter: EncounterConfig = {
        ...mockEncounter,
        setup: () => {
          setups.push(1);
          return mockEncounter.setup();
        },
      };

      const battery = createTaskBattery({
        encounters: [encounter, { ...encounter, id: 'test-e2' }],
        agentFnFactory: () => vi.fn().mockResolvedValue({ response: '', toolCalls: [] }),
        maxStepsPerEncounter: 10,
      });

      await battery.evaluate(mockAgent);
      expect(setups.length).toBe(2); // Each encounter gets its own setup call
    });
  });
});
