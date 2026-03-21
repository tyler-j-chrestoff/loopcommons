import { describe, it, expect } from 'vitest';
import {
  createSeedAgent,
  createPopulationFromSeeds,
  applyMutations,
  applyCrossovers,
  buildNextGeneration,
} from '../../../src/arena/tournament/population';
import type { ArenaToolId } from '../../../src/arena/types';
import type { TournamentAgent, AgentFitness } from '../../../src/arena/tournament/types';

const COMMIT_SHA = 'abc123';
const TOOL_POOL: ArenaToolId[] = ['inspect', 'act', 'search', 'model'];

describe('population management', () => {
  describe('createSeedAgent', () => {
    it('creates an agent with seed origin', async () => {
      const agent = await createSeedAgent({
        tools: ['inspect', 'act'],
        memoryState: '[]',
        commitSha: COMMIT_SHA,
      });
      expect(agent.origin).toBe('seed');
      expect(agent.generation).toBe(0);
      expect(agent.tools).toEqual(['inspect', 'act']);
      expect(agent.parentIds).toEqual([]);
      expect(agent.identity.commitSha).toBe(COMMIT_SHA);
      expect(agent.identity.toolCompositionHash).toBeDefined();
    });
  });

  describe('createPopulationFromSeeds', () => {
    it('creates population from seed configs', async () => {
      const seeds = [
        { tools: ['inspect', 'act'] as ArenaToolId[], memoryState: '[]' },
        { tools: ['search', 'model'] as ArenaToolId[], memoryState: '[]' },
      ];
      const population = await createPopulationFromSeeds(seeds, COMMIT_SHA);
      expect(population.length).toBe(2);
      expect(population[0].id).not.toBe(population[1].id);
    });
  });

  describe('applyMutations', () => {
    it('produces the requested number of mutant agents', async () => {
      const survivors: TournamentAgent[] = [
        await createSeedAgent({ tools: ['inspect', 'act'], memoryState: '[]', commitSha: COMMIT_SHA }),
        await createSeedAgent({ tools: ['search', 'model'], memoryState: '[]', commitSha: COMMIT_SHA }),
      ];
      const mutants = await applyMutations(survivors, 2, {
        toolPool: TOOL_POOL,
        minTools: 1,
        maxTools: 4,
        generation: 1,
        commitSha: COMMIT_SHA,
      });
      expect(mutants.agents.length).toBe(2);
      expect(mutants.records.length).toBe(2);
      mutants.agents.forEach(a => {
        expect(a.origin).toBe('mutation');
        expect(a.generation).toBe(1);
        expect(a.parentIds.length).toBe(1);
      });
    });
  });

  describe('applyCrossovers', () => {
    it('produces the requested number of crossover agents', async () => {
      const survivors: TournamentAgent[] = [
        await createSeedAgent({ tools: ['inspect', 'act'], memoryState: '[]', commitSha: COMMIT_SHA }),
        await createSeedAgent({ tools: ['search', 'model'], memoryState: '[]', commitSha: COMMIT_SHA }),
      ];
      const fitnessMap = new Map<string, number>([
        [survivors[0].id, 0.8],
        [survivors[1].id, 0.6],
      ]);
      const crossovers = await applyCrossovers(survivors, 1, fitnessMap, {
        generation: 1,
        commitSha: COMMIT_SHA,
      });
      expect(crossovers.agents.length).toBe(1);
      expect(crossovers.records.length).toBe(1);
      crossovers.agents.forEach(a => {
        expect(a.origin).toBe('crossover');
        expect(a.parentIds.length).toBe(2);
      });
    });
  });

  describe('buildNextGeneration', () => {
    it('assembles survivors + mutants + crossovers into next generation', async () => {
      const seeds = [
        { tools: ['inspect', 'act'] as ArenaToolId[], memoryState: '[]' },
        { tools: ['search', 'model'] as ArenaToolId[], memoryState: '[]' },
        { tools: ['inspect', 'search'] as ArenaToolId[], memoryState: '[]' },
        { tools: ['act', 'model'] as ArenaToolId[], memoryState: '[]' },
      ];
      const population = await createPopulationFromSeeds(seeds, COMMIT_SHA);
      const fitness: AgentFitness[] = population.map((a, i) => ({
        agentId: a.id,
        taskResults: [],
        fitnessScore: 1 - i * 0.2, // descending fitness
        metrics: { completionRate: 1, meanScore: 1, meanSteps: 3, survivalRate: 1, totalCost: 0 },
      }));

      const next = await buildNextGeneration({
        currentPopulation: population,
        fitness,
        survivorCount: 2,
        mutationCount: 1,
        crossoverCount: 1,
        toolPool: TOOL_POOL,
        minTools: 1,
        maxTools: 4,
        generation: 1,
        commitSha: COMMIT_SHA,
      });

      // 2 survivors + 1 mutant + 1 crossover = 4
      expect(next.population.length).toBe(4);
      expect(next.survivors.length).toBe(2);
      expect(next.mutations.length).toBe(1);
      expect(next.crossovers.length).toBe(1);
    });
  });
});
