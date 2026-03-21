import { describe, it, expect, vi } from 'vitest';
import { createTournament } from '../../../src/arena/tournament/runner';
import type { TournamentConfig, TournamentEvent, TaskResult } from '../../../src/arena/tournament/types';
import type { ArenaToolId } from '../../../src/arena/types';

/** Mock evaluator: deterministic scoring based on tool count. */
function mockEvaluator(agentTools: ArenaToolId[], encounterIds: string[]): TaskResult[] {
  return encounterIds.map(id => ({
    encounterId: id,
    resolved: agentTools.length >= 2,
    score: agentTools.length / 4,
    stepCount: 5 - agentTools.length,
    died: agentTools.length < 2,
    costEstimate: 0.001 * agentTools.length,
  }));
}

const baseConfig: TournamentConfig = {
  encounters: [
    { id: 'E1', name: 'Test 1', setup: () => ({} as any), getPrompt: () => '', evaluate: () => ({ resolved: true, partial: false, score: 1, details: '' }) },
    { id: 'E2', name: 'Test 2', setup: () => ({} as any), getPrompt: () => '', evaluate: () => ({ resolved: true, partial: false, score: 1, details: '' }) },
  ],
  maxGenerations: 3,
  populationSize: 4,
  survivorCount: 2,
  mutationCount: 1,
  crossoverCount: 1,
  toolPool: ['inspect', 'act', 'search', 'model'],
  minTools: 1,
  maxTools: 4,
  model: 'claude-haiku-4-5',
  maxStepsPerEncounter: 10,
  convergenceWindow: 5,
  commitSha: 'test-sha',
};

describe('tournament runner', () => {
  it('runs a full tournament with mock evaluator', async () => {
    const events: TournamentEvent[] = [];
    const tournament = createTournament(baseConfig, {
      evaluateAgent: async (agent) => mockEvaluator(agent.tools, ['E1', 'E2']),
      onEvent: (e) => events.push(e),
    });

    const seeds = [
      { tools: ['inspect', 'act'] as ArenaToolId[], memoryState: '[]' },
      { tools: ['search', 'model'] as ArenaToolId[], memoryState: '[]' },
      { tools: ['inspect'] as ArenaToolId[], memoryState: '[]' },
      { tools: ['inspect', 'act', 'search'] as ArenaToolId[], memoryState: '[]' },
    ];

    const trace = await tournament.run(seeds);

    expect(trace.generations.length).toBe(3);
    expect(trace.winner).toBeDefined();
    expect(trace.bestFitness).toBeGreaterThan(0);
    expect(trace.completedAt).toBeDefined();

    // Check events were emitted
    expect(events.some(e => e.type === 'tournament:start')).toBe(true);
    expect(events.some(e => e.type === 'generation:complete')).toBe(true);
    expect(events.some(e => e.type === 'tournament:complete')).toBe(true);
  });

  it('respects convergence window and stops early', async () => {
    // All agents get identical fitness → no improvement → should converge
    const identicalEvaluator = async () => [
      { encounterId: 'E1', resolved: true, score: 0.5, stepCount: 3, died: false, costEstimate: 0.001 },
    ];

    const config = { ...baseConfig, maxGenerations: 20, convergenceWindow: 3 };
    const events: TournamentEvent[] = [];
    const tournament = createTournament(config, {
      evaluateAgent: identicalEvaluator,
      onEvent: (e) => events.push(e),
    });

    const seeds = [
      { tools: ['inspect', 'act'] as ArenaToolId[], memoryState: '[]' },
      { tools: ['search', 'model'] as ArenaToolId[], memoryState: '[]' },
      { tools: ['inspect', 'search'] as ArenaToolId[], memoryState: '[]' },
      { tools: ['act', 'model'] as ArenaToolId[], memoryState: '[]' },
    ];

    const trace = await tournament.run(seeds);

    // Should stop before maxGenerations due to convergence
    expect(trace.generations.length).toBeLessThan(20);
    expect(events.some(e => e.type === 'tournament:converged')).toBe(true);
  });

  it('emits evaluation events for each agent', async () => {
    const events: TournamentEvent[] = [];
    const tournament = createTournament(baseConfig, {
      evaluateAgent: async (agent) => mockEvaluator(agent.tools, ['E1', 'E2']),
      onEvent: (e) => events.push(e),
    });

    const seeds = [
      { tools: ['inspect', 'act'] as ArenaToolId[], memoryState: '[]' },
      { tools: ['search'] as ArenaToolId[], memoryState: '[]' },
      { tools: ['inspect', 'act', 'search'] as ArenaToolId[], memoryState: '[]' },
      { tools: ['model'] as ArenaToolId[], memoryState: '[]' },
    ];

    await tournament.run(seeds);

    const evalEvents = events.filter(e => e.type === 'evaluation:complete');
    // 4 agents × 3 generations = 12 evaluations
    expect(evalEvents.length).toBe(12);
  });

  it('each generation has correct population size', async () => {
    const tournament = createTournament(baseConfig, {
      evaluateAgent: async (agent) => mockEvaluator(agent.tools, ['E1', 'E2']),
    });

    const seeds = [
      { tools: ['inspect', 'act'] as ArenaToolId[], memoryState: '[]' },
      { tools: ['search', 'model'] as ArenaToolId[], memoryState: '[]' },
      { tools: ['inspect', 'search'] as ArenaToolId[], memoryState: '[]' },
      { tools: ['act', 'model'] as ArenaToolId[], memoryState: '[]' },
    ];

    const trace = await tournament.run(seeds);

    // Gen 0 = seeds (4), Gen 1+ = survivors(2) + mutants(1) + crossovers(1) = 4
    trace.generations.forEach(g => {
      expect(g.population.length).toBe(4);
    });
  });
});
