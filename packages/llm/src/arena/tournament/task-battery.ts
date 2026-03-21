/**
 * Task battery — evaluates tournament agents against encounters.
 *
 * Bridges the tournament system to the existing encounter engine.
 * Each agent is evaluated sequentially through all encounters,
 * with tools scoped to the agent's current tool set.
 */

import type { EncounterConfig } from '../types';
import type { AgentFn, ExecuteEncounterOutput } from '../encounter-engine';
import { executeEncounter } from '../encounter-engine';
import { createSandboxTools } from '../sandbox-tools';
import type { TournamentAgent, TaskResult } from './types';

export function encounterResultToTaskResult(
  encounterId: string,
  output: ExecuteEncounterOutput,
): TaskResult {
  return {
    encounterId,
    resolved: output.encounterResult.resolved,
    score: output.encounterResult.score,
    stepCount: output.steps.length,
    died: output.death.dead,
    costEstimate: output.steps.length * 0.0005,
  };
}

type TaskBatteryConfig = {
  encounters: EncounterConfig[];
  agentFnFactory: (agent: TournamentAgent) => AgentFn;
  maxStepsPerEncounter: number;
};

export type TaskBattery = {
  evaluate: (agent: TournamentAgent) => Promise<TaskResult[]>;
};

/**
 * Create a task battery that evaluates agents against a set of encounters.
 *
 * Follows the same pattern as arena-run: create sandbox, create tools from
 * sandbox filtered by agent's tool set, pass pre-setup sandbox to encounter engine.
 */
export function createTaskBattery(config: TaskBatteryConfig): TaskBattery {
  async function evaluate(agent: TournamentAgent): Promise<TaskResult[]> {
    const agentFn = config.agentFnFactory(agent);
    const results: TaskResult[] = [];

    for (const encounter of config.encounters) {
      // Create sandbox and scope tools to agent's composition
      const sandbox = encounter.setup();
      const sandboxTools = createSandboxTools(sandbox)
        .filter(t => agent.tools.includes(t.name as any));

      const output = await executeEncounter({
        encounter: {
          ...encounter,
          setup: () => sandbox, // reuse pre-created sandbox
        },
        tools: sandboxTools,
        agentFn,
        maxSteps: config.maxStepsPerEncounter,
      });
      results.push(encounterResultToTaskResult(encounter.id, output));
    }

    return results;
  }

  return { evaluate };
}
