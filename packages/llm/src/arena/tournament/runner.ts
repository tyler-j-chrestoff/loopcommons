/**
 * Tournament runner — the main evolutionary loop.
 *
 * For each generation:
 *   1. Evaluate all agents on the task battery
 *   2. Rank by fitness
 *   3. Select survivors
 *   4. Create next generation via mutation + crossover
 *
 * Stops at maxGenerations or when best fitness plateaus (convergence).
 */

import * as crypto from 'node:crypto';
import type { ArenaToolId } from '../types';
import type {
  TournamentConfig,
  TournamentAgent,
  TournamentTrace,
  TournamentEvent,
  TaskResult,
  AgentFitness,
  GenerationResult,
} from './types';
import { computeAgentFitness } from './fitness';
import {
  createPopulationFromSeeds,
  buildNextGeneration,
} from './population';

type EvaluateAgentFn = (agent: TournamentAgent) => Promise<TaskResult[]>;

type TournamentOptions = {
  evaluateAgent: EvaluateAgentFn;
  onEvent?: (event: TournamentEvent) => void;
};

export function createTournament(config: TournamentConfig, options: TournamentOptions) {
  const emit = options.onEvent ?? (() => {});

  async function run(
    seeds: Array<{ tools: ArenaToolId[]; memoryState: string }>,
  ): Promise<TournamentTrace> {
    const tournamentId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    emit({ type: 'tournament:start', config });

    let population = await createPopulationFromSeeds(seeds, config.commitSha);
    const allGenerations: GenerationResult[] = [];
    let bestFitness = -Infinity;
    let bestAgent: TournamentAgent | null = null;
    let noImprovementCount = 0;

    for (let gen = 0; gen < config.maxGenerations; gen++) {
      const genStart = Date.now();
      emit({ type: 'generation:start', generation: gen });

      // Evaluate all agents
      const fitnessResults: AgentFitness[] = [];
      for (const agent of population) {
        const taskResults = await options.evaluateAgent(agent);
        const fitness = computeAgentFitness(agent.id, taskResults);
        fitnessResults.push(fitness);
        emit({ type: 'evaluation:complete', generation: gen, agentId: agent.id, fitness });
      }

      // Track best
      const genBest = fitnessResults.reduce((a, b) =>
        a.fitnessScore > b.fitnessScore ? a : b,
      );

      if (genBest.fitnessScore > bestFitness) {
        bestFitness = genBest.fitnessScore;
        bestAgent = population.find(a => a.id === genBest.agentId) ?? null;
        noImprovementCount = 0;
      } else {
        noImprovementCount++;
      }

      // Build generation result (selection + mutation + crossover happens inside)
      let survivors: string[] = [];
      let mutations: GenerationResult['mutations'] = [];
      let crossovers: GenerationResult['crossovers'] = [];

      if (gen < config.maxGenerations - 1 && noImprovementCount < config.convergenceWindow) {
        const next = await buildNextGeneration({
          currentPopulation: population,
          fitness: fitnessResults,
          survivorCount: config.survivorCount,
          mutationCount: config.mutationCount,
          crossoverCount: config.crossoverCount,
          toolPool: config.toolPool,
          minTools: config.minTools,
          maxTools: config.maxTools,
          generation: gen + 1,
          commitSha: config.commitSha,
        });

        survivors = next.survivors;
        mutations = next.mutations;
        crossovers = next.crossovers;

        const genResult: GenerationResult = {
          generation: gen,
          population,
          fitness: fitnessResults,
          survivors,
          mutations,
          crossovers,
          lineage: [], // lineage records built from mutations/crossovers
          durationMs: Date.now() - genStart,
        };

        allGenerations.push(genResult);
        emit({ type: 'generation:complete', result: genResult });
        emit({ type: 'selection:complete', generation: gen, survivors });

        population = next.population;
      } else {
        // Final generation or converged
        const genResult: GenerationResult = {
          generation: gen,
          population,
          fitness: fitnessResults,
          survivors: population.map(a => a.id),
          mutations: [],
          crossovers: [],
          lineage: [],
          durationMs: Date.now() - genStart,
        };
        allGenerations.push(genResult);
        emit({ type: 'generation:complete', result: genResult });

        if (noImprovementCount >= config.convergenceWindow) {
          emit({ type: 'tournament:converged', generation: gen, bestFitness });
          break;
        }
      }
    }

    const trace: TournamentTrace = {
      tournamentId,
      config,
      generations: allGenerations,
      startedAt,
      completedAt: new Date().toISOString(),
      winner: bestAgent,
      bestFitness,
    };

    emit({ type: 'tournament:complete', trace });

    return trace;
  }

  return { run };
}
