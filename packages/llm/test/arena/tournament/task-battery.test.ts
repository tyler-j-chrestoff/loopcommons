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

    it('passes memoryContext when enableMemory is true and agent has memories', async () => {
      let receivedMemoryContext: string | undefined;

      const captureAgentFn: AgentFn = async (input) => {
        receivedMemoryContext = input.memoryContext;
        return { response: '', toolCalls: [] };
      };

      const memories = [{
        type: 'learning' as const,
        id: 'mem-1',
        topic: 'service restart',
        insight: 'Always check logs before restarting',
        applicableTo: ['devops'],
        provenance: { agent: 'arena-agent', timestamp: '2026-03-24T00:00:00Z', used: [] },
        modality: 'belief' as const,
        uncertainty: 0.3,
        visibility: 'local' as const,
        tags: ['devops'],
        updatedAt: '2026-03-24T00:00:00Z',
        accessCount: 0,
      }];

      const battery = createTaskBattery({
        encounters: [mockEncounter],
        agentFnFactory: () => captureAgentFn,
        maxStepsPerEncounter: 10,
        enableMemory: true,
      });

      const agentWithMemory = {
        ...mockAgent,
        memoryState: JSON.stringify(memories),
      };

      await battery.evaluate(agentWithMemory);
      expect(receivedMemoryContext).toBeDefined();
      expect(receivedMemoryContext).toContain('service restart');
      expect(receivedMemoryContext).toContain('Always check logs');
    });

    it('does not pass memoryContext when enableMemory is false', async () => {
      let receivedMemoryContext: string | undefined = 'should-be-cleared';

      const captureAgentFn: AgentFn = async (input) => {
        receivedMemoryContext = input.memoryContext;
        return { response: '', toolCalls: [] };
      };

      const battery = createTaskBattery({
        encounters: [mockEncounter],
        agentFnFactory: () => captureAgentFn,
        maxStepsPerEncounter: 10,
      });

      await battery.evaluate(mockAgent);
      expect(receivedMemoryContext).toBeUndefined();
    });

    it('does not pass memoryContext when agent has empty memoryState', async () => {
      let receivedMemoryContext: string | undefined = 'should-be-cleared';

      const captureAgentFn: AgentFn = async (input) => {
        receivedMemoryContext = input.memoryContext;
        return { response: '', toolCalls: [] };
      };

      const battery = createTaskBattery({
        encounters: [mockEncounter],
        agentFnFactory: () => captureAgentFn,
        maxStepsPerEncounter: 10,
        enableMemory: true,
      });

      await battery.evaluate(mockAgent); // mockAgent has memoryState: '[]'
      expect(receivedMemoryContext).toBeUndefined();
    });

    it('calls reflection after encounter and stores memory capsule', async () => {
      const reflectionCalls: string[] = [];
      const mockReflectionFn = async (prompt: string) => {
        reflectionCalls.push(prompt);
        return 'Always check service dependencies before restarting.';
      };

      const agentWithMemory = {
        ...mockAgent,
        memoryState: '[]',
      };

      const battery = createTaskBattery({
        encounters: [mockEncounter],
        agentFnFactory: () => vi.fn().mockResolvedValue({
          response: 'Fixed.',
          toolCalls: [{ toolName: 'inspect', input: { target: 'x' }, output: 'ok' }],
        }),
        maxStepsPerEncounter: 10,
        enableMemory: true,
        reflectionLlmFn: mockReflectionFn,
      });

      await battery.evaluate(agentWithMemory);

      // Reflection was called
      expect(reflectionCalls).toHaveLength(1);
      expect(reflectionCalls[0]).toContain('Encounter:');
      expect(reflectionCalls[0]).toContain('Outcome:');

      // Memory was persisted back to agent
      const memories = JSON.parse(agentWithMemory.memoryState);
      expect(memories).toHaveLength(1);
      expect(memories[0].type).toBe('learning');
      expect(memories[0].insight).toContain('check service dependencies');
    });

    it('accumulates memories across encounters in same evaluation', async () => {
      let receivedContexts: (string | undefined)[] = [];

      const captureAgentFn: AgentFn = async (input) => {
        receivedContexts.push(input.memoryContext);
        return { response: '', toolCalls: [{ toolName: 'inspect', input: {}, output: 'ok' }] };
      };

      const agentWithMemory = {
        ...mockAgent,
        memoryState: '[]',
      };

      let callCount = 0;
      const battery = createTaskBattery({
        encounters: [mockEncounter, { ...mockEncounter, id: 'test-e2' }],
        agentFnFactory: () => captureAgentFn,
        maxStepsPerEncounter: 10,
        enableMemory: true,
        reflectionLlmFn: async () => {
          callCount++;
          return `Lesson ${callCount} from encounter.`;
        },
      });

      await battery.evaluate(agentWithMemory);

      // First encounter: no prior memories
      expect(receivedContexts[0]).toBeUndefined();
      // Second encounter: has the reflection from first encounter
      expect(receivedContexts[1]).toBeDefined();
      expect(receivedContexts[1]).toContain('Lesson 1');

      // Agent now has 2 memories (one per encounter)
      const memories = JSON.parse(agentWithMemory.memoryState);
      expect(memories).toHaveLength(2);
    });

    it('does not call reflection when reflectionLlmFn is not provided', async () => {
      const agentWithMemory = { ...mockAgent, memoryState: '[]' };

      const battery = createTaskBattery({
        encounters: [mockEncounter],
        agentFnFactory: () => vi.fn().mockResolvedValue({ response: '', toolCalls: [] }),
        maxStepsPerEncounter: 10,
        enableMemory: true,
        // no reflectionLlmFn
      });

      await battery.evaluate(agentWithMemory);
      expect(agentWithMemory.memoryState).toBe('[]');
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
