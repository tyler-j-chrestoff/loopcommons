#!/usr/bin/env tsx
/**
 * Arena tournament runner — evolutionary selection over tool compositions.
 *
 * Usage:
 *   npm run arena:tournament                    — full tournament (10 generations)
 *   npm run arena:tournament -- --generations 5 — custom generation count
 *   npm run arena:tournament -- --population 8  — custom population size
 *   npm run arena:tournament -- --pilot         — small pilot (4 agents, 3 generations)
 *   npm run arena:tournament -- --mock          — mock mode (no API key needed)
 *
 * Requires ANTHROPIC_API_KEY unless --mock is specified.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ENCOUNTERS } from '../src/arena/encounters';
import { BRUTAL_ENCOUNTERS } from '../src/arena/brutal-encounters';
import { GENERALIZATION_ENCOUNTERS } from '../src/arena/tournament/generalization-encounters';
import { createTournament } from '../src/arena/tournament/runner';
import { createTournamentWriter } from '../src/arena/tournament/writer';
import { createTaskBattery } from '../src/arena/tournament/task-battery';
import type { TournamentConfig, TournamentAgent, TournamentEvent } from '../src/arena/tournament/types';
import type { ArenaToolId } from '../src/arena/types';
import type { AgentFn } from '../src/arena/encounter-engine';
import type { ManaConfig } from '../src/arena/mana';

// ---------------------------------------------------------------------------
// Mana config — exploration-then-action phase gating
// ---------------------------------------------------------------------------

const manaConfig: ManaConfig = {
  explorationSlots: 3,
  toolCosts: {
    inspect: 1,
    search: 1,
    model: 1,
    act: 0,
    done: 0,
  },
};

// ---------------------------------------------------------------------------
// Load API key
// ---------------------------------------------------------------------------

if (!process.env.ANTHROPIC_API_KEY) {
  const envPath = path.resolve(import.meta.dirname, '../../web/.env.local');
  try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key === 'ANTHROPIC_API_KEY') {
        process.env.ANTHROPIC_API_KEY = value;
      }
    }
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const isPilot = args.includes('--pilot');
const isMock = args.includes('--mock');
const useNicheSelection = args.includes('--niche');
const genIdx = args.indexOf('--generations');
const popIdx = args.indexOf('--population');

const maxGenerations = isPilot ? 3 : (genIdx >= 0 ? parseInt(args[genIdx + 1]) : 10);
const populationSize = isPilot ? 4 : (popIdx >= 0 ? parseInt(args[popIdx + 1]) : 8);

if (!isMock && !process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY required (or use --mock for mock mode)');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Mock agent function — deterministic, for testing
// ---------------------------------------------------------------------------

function createMockAgentFn(_agent: TournamentAgent): AgentFn {
  return async ({ prompt, tools, sandbox }) => {
    const toolCalls: Array<{ toolName: string; input: Record<string, unknown>; output: string }> = [];

    for (const t of tools.slice(0, 3)) {
      const input = t.name === 'inspect'
        ? { target: 'service:data-ingest' }
        : t.name === 'act'
          ? { command: 'restart data-ingest' }
          : t.name === 'search'
            ? { query: 'config migration' }
            : { system: 'all' };

      try {
        const output = await t.execute(input as any);
        toolCalls.push({ toolName: t.name, input, output: String(output) });
      } catch {
        toolCalls.push({ toolName: t.name, input, output: 'mock-error' });
      }
    }

    return { response: 'Mock resolution applied.', toolCalls };
  };
}

// ---------------------------------------------------------------------------
// Live agent function factory (requires API key)
// ---------------------------------------------------------------------------

async function createLiveAgentFnFactory(_agent: TournamentAgent): Promise<AgentFn> {
  const { createLiveAgentFn } = await import('../src/arena/live-agent');
  return createLiveAgentFn();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const outputDir = path.resolve(import.meta.dirname, '../data/arena/tournament');
  const writer = createTournamentWriter(outputDir);

  // Task battery: roguelike + brutal + generalization encounters
  const allEncounters = [...ENCOUNTERS, ...BRUTAL_ENCOUNTERS, ...GENERALIZATION_ENCOUNTERS];

  const battery = createTaskBattery({
    encounters: allEncounters,
    agentFnFactory: isMock
      ? (agent) => createMockAgentFn(agent)
      : (agent) => {
          // Lazy-load live agent (async import handled at top-level)
          let cached: AgentFn | null = null;
          return async (input) => {
            if (!cached) {
              cached = await createLiveAgentFnFactory(agent);
            }
            return cached(input);
          };
        },
    maxStepsPerEncounter: 10,
    manaConfig,
  });

  const config: TournamentConfig = {
    encounters: allEncounters,
    maxGenerations,
    populationSize,
    survivorCount: Math.floor(populationSize / 2),
    mutationCount: Math.floor(populationSize / 4),
    crossoverCount: Math.floor(populationSize / 4),
    toolPool: ['inspect', 'act', 'search', 'model'],
    minTools: 1,
    maxTools: 4,
    model: 'claude-haiku-4-5',
    maxStepsPerEncounter: 10,
    convergenceWindow: 5,
    commitSha: 'arena-tournament',
    manaConfig,
    nicheSelection: useNicheSelection,
  };

  console.log(`\n  Arena Tournament${isPilot ? ' (pilot)' : ''}${isMock ? ' (mock)' : ''}${useNicheSelection ? ' (niche selection)' : ''}`);
  console.log(`  Population: ${populationSize} | Generations: ${maxGenerations}`);
  console.log(`  Encounters: ${allEncounters.length} (${ENCOUNTERS.length} roguelike + ${BRUTAL_ENCOUNTERS.length} brutal + ${GENERALIZATION_ENCOUNTERS.length} generalization)`);
  console.log(`  Survivors: ${config.survivorCount} | Mutations: ${config.mutationCount} | Crossovers: ${config.crossoverCount}`);
  console.log(`  Mana: ${manaConfig.explorationSlots} exploration slots (inspect/search/model cost 1, act/done free)`);
  console.log();

  // Seed population: diverse starting compositions
  const seeds: Array<{ tools: ArenaToolId[]; memoryState: string }> = [];
  const seedCompositions: ArenaToolId[][] = [
    ['inspect', 'act'],
    ['search', 'model'],
    ['inspect', 'search'],
    ['act', 'model'],
    ['inspect', 'act', 'search'],
    ['act', 'search', 'model'],
    ['inspect', 'model'],
    ['inspect', 'act', 'search', 'model'],
  ];

  for (let i = 0; i < populationSize; i++) {
    seeds.push({
      tools: seedCompositions[i % seedCompositions.length],
      memoryState: '[]',
    });
  }

  const eventSink = writer.createEventSink();

  const tournament = createTournament(config, {
    evaluateAgent: async (agent) => battery.evaluate(agent),
    onEvent: (event: TournamentEvent) => {
      eventSink(event);

      // Terminal output
      switch (event.type) {
        case 'generation:start':
          process.stdout.write(`  Gen ${event.generation}: evaluating...`);
          break;
        case 'evaluation:complete':
          process.stdout.write('.');
          break;
        case 'generation:complete': {
          const best = event.result.fitness.reduce((a, b) =>
            a.fitnessScore > b.fitnessScore ? a : b,
          );
          const health = event.result.populationHealth;
          const healthStr = health
            ? ` coverage=${health.collectiveCoverage.toFixed(2)} niches=${health.nicheCount} diversity=${health.compositionDiversity}`
            : '';
          console.log(` best=${best.fitnessScore.toFixed(3)}${healthStr} (${event.result.durationMs}ms)`);
          writer.writeGeneration(event.result);
          break;
        }
        case 'tournament:converged':
          console.log(`\n  Converged at generation ${event.generation} (best=${event.bestFitness.toFixed(3)})`);
          break;
        case 'tournament:complete': {
          const trace = event.trace;
          writer.writeTournamentComplete(trace);
          console.log(`\n  Tournament complete!`);
          console.log(`  Winner: ${trace.winner?.id ?? 'none'}`);
          console.log(`  Tools: [${trace.winner?.tools.join(', ') ?? 'none'}]`);
          console.log(`  Origin: ${trace.winner?.origin ?? 'none'}`);
          console.log(`  Best fitness: ${trace.bestFitness.toFixed(3)}`);
          console.log(`  Generations: ${trace.generations.length}`);
          console.log(`  Output: ${outputDir}`);
          break;
        }
      }
    },
  });

  await tournament.run(seeds);
}

main().catch(err => {
  console.error('\nTournament failed:', err);
  process.exit(1);
});
