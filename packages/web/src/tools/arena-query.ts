import { defineTool } from '@loopcommons/llm';
import type { ToolPackage } from '@loopcommons/llm';
import { z } from 'zod';
import type { TournamentSnapshot, TournamentStatus } from '@/lib/tournament-manager';

type ArenaQueryDeps = {
  getSnapshot: () => TournamentSnapshot;
  getStatus: () => TournamentStatus;
};

export function createArenaQueryPackage(deps: ArenaQueryDeps): ToolPackage {
  const queryTournament = defineTool({
    name: 'queryTournament',
    description: 'Query the current tournament state, leaderboard, or population composition.',
    parameters: z.object({
      view: z.enum(['summary', 'leaderboard', 'population']).optional()
        .describe('What view to return. Defaults to summary.'),
    }),
    execute: async (input) => {
      const snap = deps.getSnapshot();

      if (!snap.tournamentId) {
        return JSON.stringify({ status: 'idle', message: 'No tournament is active.' });
      }

      if (input.view === 'leaderboard') {
        const leaderboard = [...snap.fitness]
          .sort((a, b) => b.fitnessScore - a.fitnessScore)
          .map((f, rank) => {
            const agent = snap.population.find(p => p.id === f.agentId);
            return { rank: rank + 1, agentId: f.agentId, tools: agent?.tools ?? [], fitnessScore: f.fitnessScore };
          });
        return JSON.stringify({ tournamentId: snap.tournamentId, generation: snap.generation, leaderboard });
      }

      if (input.view === 'population') {
        return JSON.stringify({
          tournamentId: snap.tournamentId,
          generation: snap.generation,
          population: snap.population,
        });
      }

      return JSON.stringify({
        tournamentId: snap.tournamentId,
        status: snap.status,
        generation: snap.generation,
        populationSize: snap.population.length,
        bestFitness: snap.bestFitness,
        bestAgent: snap.bestAgent,
        startedAt: snap.startedAt,
      });
    },
  });

  const listTournaments = defineTool({
    name: 'listTournaments',
    description: 'List recent and active tournaments.',
    parameters: z.object({}),
    execute: async () => {
      const snap = deps.getSnapshot();
      if (!snap.tournamentId) {
        return JSON.stringify({ tournaments: [] });
      }
      return JSON.stringify({
        tournaments: [{
          tournamentId: snap.tournamentId,
          status: snap.status,
          generation: snap.generation,
          bestFitness: snap.bestFitness,
          startedAt: snap.startedAt,
        }],
      });
    },
  });

  const compareFitness = defineTool({
    name: 'compareFitness',
    description: 'Compare fitness of two tool compositions in the current tournament.',
    parameters: z.object({
      composition1: z.array(z.string()).describe('First tool composition, e.g. ["inspect", "act"]'),
      composition2: z.array(z.string()).describe('Second tool composition, e.g. ["search", "model"]'),
    }),
    execute: async (input) => {
      const snap = deps.getSnapshot();

      function findFitness(tools: string[]): number | null {
        const sorted = [...tools].sort().join(',');
        for (const agent of snap.population) {
          if ([...agent.tools].sort().join(',') === sorted) {
            const f = snap.fitness.find(f => f.agentId === agent.id);
            if (f) return f.fitnessScore;
          }
        }
        return null;
      }

      return JSON.stringify({
        comparison: [
          { tools: input.composition1, fitnessScore: findFitness(input.composition1) },
          { tools: input.composition2, fitnessScore: findFitness(input.composition2) },
        ],
        generation: snap.generation,
      });
    },
  });

  return {
    tools: [queryTournament, listTournaments, compareFitness],
    formatContext: () => {
      const status = deps.getStatus();
      if (status === 'idle') return 'Arena: no active tournament.';
      const snap = deps.getSnapshot();
      return `Arena: tournament ${snap.tournamentId?.slice(0, 8) ?? '?'} ${snap.status}, gen ${snap.generation}, best fitness ${snap.bestFitness.toFixed(3)}.`;
    },
    metadata: {
      name: 'arena-query',
      capabilities: ['query tournament state', 'list tournaments', 'compare fitness'],
      intent: ['Answer questions about arena tournaments, leaderboards, and agent compositions'],
      sideEffects: false,
    },
  };
}
