/**
 * Tournament runner bridge — connects the LLM arena tournament engine
 * to the web layer's tournament manager for SSE streaming.
 */

import { resolve } from 'node:path';
import type {
  TournamentConfig,
  TournamentEvent,
  TournamentTrace,
  TournamentAgent,
} from '@loopcommons/llm/arena/tournament';
import type { ArenaToolId, AgentFn } from '@loopcommons/llm/arena';

export type RunTournamentOptions = {
  tournamentId: string;
  maxGenerations: number;
  populationSize: number;
  mock: boolean;
  onEvent: (event: TournamentEvent) => void;
  onComplete: (trace: TournamentTrace) => void;
  onError: (err: unknown) => void;
};

export async function runTournamentAsync(opts: RunTournamentOptions): Promise<void> {
  try {
    // Fail fast if no API key for live mode
    if (!opts.mock && !process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not set. Use mock mode or set the environment variable.');
    }

    const { createTournament, createTaskBattery } = await import('@loopcommons/llm/arena/tournament');
    const { ENCOUNTERS } = await import('@loopcommons/llm/arena');

    let allEncounters = [...ENCOUNTERS];

    // Dynamically import brutal + generalization encounters
    try {
      const brutal = await import('@loopcommons/llm/arena');
      if ('BRUTAL_ENCOUNTERS' in brutal) {
        allEncounters = [...allEncounters, ...(brutal as any).BRUTAL_ENCOUNTERS];
      }
    } catch { /* not available */ }

    try {
      const genMod = await import('@loopcommons/llm/arena/tournament');
      if ('GENERALIZATION_ENCOUNTERS' in genMod) {
        allEncounters = [...allEncounters, ...(genMod as any).GENERALIZATION_ENCOUNTERS];
      }
    } catch { /* not available */ }

    const manaConfig = {
      explorationSlots: 3,
      toolCosts: { inspect: 1, search: 1, model: 1, act: 0, done: 0 },
    };

    const agentFnFactory = opts.mock
      ? (agent: TournamentAgent) => createMockAgentFn(agent)
      : await createLiveAgentFnFactory();

    // Persist every event + step traces to disk — traces are the primary artifact
    const { createTournamentWriter, createTraceWriter } = await import('@loopcommons/llm/arena/tournament');
    const dataDir = resolve(
      process.env.SESSION_DATA_DIR ?? process.cwd(),
      'data/arena/tournaments',
      opts.tournamentId,
    );
    const writer = createTournamentWriter(dataDir);
    const eventSink = writer.createEventSink();
    const traceWriter = createTraceWriter(dataDir);

    const battery = createTaskBattery({
      encounters: allEncounters,
      agentFnFactory,
      maxStepsPerEncounter: 10,
      manaConfig,
      onEncounterComplete: (agentId, encounterId, output) => {
        traceWriter.writeTrace(agentId, encounterId, output);
      },
    });

    const config: TournamentConfig = {
      encounters: allEncounters,
      maxGenerations: opts.maxGenerations,
      populationSize: opts.populationSize,
      survivorCount: Math.floor(opts.populationSize / 2),
      mutationCount: Math.floor(opts.populationSize / 4),
      crossoverCount: Math.floor(opts.populationSize / 4),
      toolPool: ['inspect', 'act', 'search', 'model'] as ArenaToolId[],
      minTools: 1,
      maxTools: 4,
      model: 'claude-haiku-4-5',
      maxStepsPerEncounter: 10,
      convergenceWindow: 5,
      commitSha: 'web-tournament',
      manaConfig,
    };

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

    const seeds = Array.from({ length: opts.populationSize }, (_, i) => ({
      tools: seedCompositions[i % seedCompositions.length],
      memoryState: '[]',
    }));

    const tournament = createTournament(config, {
      evaluateAgent: (agent) => battery.evaluate(agent),
      onEvent: (event) => {
        // Disk first — traces are the primary artifact
        eventSink(event);
        if (event.type === 'generation:complete') {
          writer.writeGeneration(event.result);
        }
        if (event.type === 'tournament:complete') {
          writer.writeTournamentComplete(event.trace);
        }
        // Then stream to SSE subscribers
        opts.onEvent(event);
      },
    });

    const trace = await tournament.run(seeds);
    opts.onComplete(trace);
  } catch (err) {
    opts.onError(err);
  }
}

function createMockAgentFn(_agent: TournamentAgent): AgentFn {
  return async ({ tools }) => {
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

async function createLiveAgentFnFactory(): Promise<(agent: TournamentAgent) => AgentFn> {
  const { createLiveAgentFn } = await import('@loopcommons/llm/arena');
  return (_agent: TournamentAgent) => createLiveAgentFn();
}
