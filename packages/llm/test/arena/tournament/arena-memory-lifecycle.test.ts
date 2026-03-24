import { describe, it, expect, vi } from 'vitest';
import { createInMemoryState } from '@loopcommons/memory/in-memory';
import { formatMemoryContext } from '@loopcommons/memory';
import type { Memory } from '@loopcommons/memory';
import { crossoverAgents, mergeMemoryStates } from '../../../src/arena/tournament/crossover';
import { createTaskBattery } from '../../../src/arena/tournament/task-battery';
import type { EncounterConfig } from '../../../src/arena/types';
import type { TournamentAgent } from '../../../src/arena/tournament/types';
import type { AgentFn } from '../../../src/arena/encounter-engine';

const makeMemory = (id: string, topic: string, insight: string, uncertainty = 0.3): Memory => ({
  type: 'learning',
  id,
  topic,
  insight,
  applicableTo: ['arena'],
  provenance: { agent: 'arena-agent', timestamp: '2026-03-24T00:00:00Z', used: [] },
  modality: 'belief',
  uncertainty,
  visibility: 'local',
  tags: [],
  updatedAt: '2026-03-24T00:00:00Z',
  accessCount: 0,
});

const mockEncounter: EncounterConfig = {
  id: 'enc-1',
  name: 'Test Encounter',
  setup: () => ({
    files: new Map(),
    services: new Map(),
    incidentDb: [],
    dependencyGraph: {},
    commandLog: [],
  }),
  getPrompt: () => 'Service is down. Fix it.',
  evaluate: () => ({ resolved: true, partial: false, score: 0.8, details: 'Done.' }),
};

const baseAgent: TournamentAgent = {
  id: 'agent-1',
  tools: ['inspect', 'act'],
  memoryState: '[]',
  identity: { commitSha: 'abc', toolCompositionHash: 'h1', derivedPromptHash: 'h1' },
  generation: 0,
  origin: 'seed',
  parentIds: [],
};

describe('arena memory lifecycle', () => {
  describe('InMemoryState round-trip', () => {
    it('round-trips through serialize → construct', async () => {
      const mem1 = makeMemory('m1', 'logs', 'Check logs first');
      const mem2 = makeMemory('m2', 'restart', 'Restart is a last resort');

      const state1 = createInMemoryState(JSON.stringify([mem1, mem2]));
      await state1.remember({ type: 'learning', topic: 'deps', insight: 'Map deps before acting' });

      const serialized = state1.serialize();
      const state2 = createInMemoryState(serialized);
      const recalled = await state2.recall({ limit: 10 });
      expect(recalled).toHaveLength(3);
    });
  });

  describe('memory context formatting', () => {
    it('formats memories for system prompt injection', async () => {
      const state = createInMemoryState(JSON.stringify([
        makeMemory('m1', 'logs', 'Check logs before restarting'),
      ]));
      const memories = await state.recall({ limit: 5 });
      const ctx = formatMemoryContext(memories);
      expect(ctx).toContain('Agent memories');
      expect(ctx).toContain('Check logs before restarting');
      expect(ctx).toContain('[learning]');
    });
  });

  describe('reflection produces valid memory capsule', () => {
    it('generates learning memory from encounter trajectory', async () => {
      const agent = { ...baseAgent, memoryState: '[]' };

      const battery = createTaskBattery({
        encounters: [mockEncounter],
        agentFnFactory: () => vi.fn().mockResolvedValue({
          response: '',
          toolCalls: [{ toolName: 'inspect', input: { target: 'services' }, output: 'web: down' }],
        }),
        maxStepsPerEncounter: 10,
        enableMemory: true,
        reflectionLlmFn: async () => 'When a service is down, check its dependencies first.',
      });

      await battery.evaluate(agent);
      const memories: Memory[] = JSON.parse(agent.memoryState);
      expect(memories).toHaveLength(1);
      expect(memories[0].type).toBe('learning');
      expect(memories[0].topic).toBe('encounter-reflection');
      expect((memories[0] as any).insight).toContain('dependencies');
    });
  });

  describe('memoryState grows across encounters', () => {
    it('encounter N+1 sees memories from encounters 1..N', async () => {
      const receivedContexts: (string | undefined)[] = [];
      const captureAgentFn: AgentFn = async (input) => {
        receivedContexts.push(input.memoryContext);
        return {
          response: '',
          toolCalls: [{ toolName: 'inspect', input: {}, output: 'ok' }],
        };
      };

      const enc2 = { ...mockEncounter, id: 'enc-2' };
      const enc3 = { ...mockEncounter, id: 'enc-3' };
      const agent = { ...baseAgent, memoryState: '[]' };

      let reflectionCount = 0;
      const battery = createTaskBattery({
        encounters: [mockEncounter, enc2, enc3],
        agentFnFactory: () => captureAgentFn,
        maxStepsPerEncounter: 10,
        enableMemory: true,
        reflectionLlmFn: async () => `Lesson ${++reflectionCount}`,
      });

      await battery.evaluate(agent);

      // Encounter 1: no memories
      expect(receivedContexts[0]).toBeUndefined();
      // Encounter 2: 1 memory from encounter 1
      expect(receivedContexts[1]).toContain('Lesson 1');
      // Encounter 3: 2 memories from encounters 1 & 2
      expect(receivedContexts[2]).toContain('Lesson 1');
      expect(receivedContexts[2]).toContain('Lesson 2');

      // Agent has all 3 memories
      const memories: Memory[] = JSON.parse(agent.memoryState);
      expect(memories).toHaveLength(3);
    });
  });

  describe('mutation inherits updated memories', () => {
    it('child agent has parent memories after evaluation', async () => {
      const parent = { ...baseAgent, memoryState: '[]' };

      const battery = createTaskBattery({
        encounters: [mockEncounter],
        agentFnFactory: () => vi.fn().mockResolvedValue({
          response: '',
          toolCalls: [{ toolName: 'act', input: {}, output: 'ok' }],
        }),
        maxStepsPerEncounter: 10,
        enableMemory: true,
        reflectionLlmFn: async () => 'Restart worked for this case.',
      });

      await battery.evaluate(parent);

      // Simulate mutation: child inherits parent's memoryState
      const child: TournamentAgent = {
        ...baseAgent,
        id: 'agent-child',
        memoryState: parent.memoryState,
        generation: 1,
        origin: 'mutation',
        parentIds: [parent.id],
      };

      const childMemories: Memory[] = JSON.parse(child.memoryState);
      expect(childMemories).toHaveLength(1);
      expect((childMemories[0] as any).insight).toContain('Restart worked');
    });
  });

  describe('crossover merges updated memories', () => {
    it('merges reflection memories from two parents', async () => {
      // Parent A has 2 memories
      const memA = [
        makeMemory('ma1', 'logs', 'Check logs', 0.3),
        makeMemory('ma2', 'deps', 'Map dependencies', 0.2),
      ];
      // Parent B has 1 memory
      const memB = [
        makeMemory('mb1', 'restart', 'Restart is safe', 0.4),
      ];

      const result = crossoverAgents(
        { tools: ['inspect', 'act'], memoryState: JSON.stringify(memA), fitness: 0.8 },
        { tools: ['search', 'model'], memoryState: JSON.stringify(memB), fitness: 0.6 },
        { parentIds: ['parent-a', 'parent-b'] },
      );

      expect(result.memoryCounts.parent1).toBe(2);
      expect(result.memoryCounts.parent2).toBe(1);
      expect(result.memoryCounts.merged).toBe(3);

      const merged: Memory[] = JSON.parse(result.mergedMemory);
      expect(merged).toHaveLength(3);

      // Fitter parent's memories have lower uncertainty adjustment
      const fromA = merged.filter((m) => (m.provenance as any).source?.includes('parent-a'));
      const fromB = merged.filter((m) => (m.provenance as any).source?.includes('parent-b'));
      expect(fromA).toHaveLength(2);
      expect(fromB).toHaveLength(1);
    });
  });

  describe('empty reflection is skipped', () => {
    it('does not store memory when reflection returns empty string', async () => {
      const agent = { ...baseAgent, memoryState: '[]' };

      const battery = createTaskBattery({
        encounters: [mockEncounter],
        agentFnFactory: () => vi.fn().mockResolvedValue({
          response: '',
          toolCalls: [{ toolName: 'act', input: {}, output: 'ok' }],
        }),
        maxStepsPerEncounter: 10,
        enableMemory: true,
        reflectionLlmFn: async () => '   ',
      });

      await battery.evaluate(agent);
      const memories = JSON.parse(agent.memoryState);
      expect(memories).toHaveLength(0);
    });
  });
});
