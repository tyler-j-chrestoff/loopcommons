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
import type { ManaConfig } from '../mana';

export function encounterResultToTaskResult(
  encounterId: string,
  output: ExecuteEncounterOutput,
): TaskResult {
  // Collateral: wrong actions that caused damage (death with score 0 = max collateral)
  const collateral = output.death.dead && output.encounterResult.score === 0
    ? 1.0
    : output.death.dead
      ? 0.5
      : 0;

  return {
    encounterId,
    resolved: output.encounterResult.resolved,
    score: output.encounterResult.score,
    stepCount: output.steps.length,
    died: output.death.dead,
    costEstimate: output.steps.length * 0.0005,
    collateral,
  };
}

type TaskBatteryConfig = {
  encounters: EncounterConfig[];
  agentFnFactory: (agent: TournamentAgent) => AgentFn;
  maxStepsPerEncounter: number;
  manaConfig?: ManaConfig;
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
        manaConfig: config.manaConfig,
      });
      results.push(encounterResultToTaskResult(encounter.id, output));
    }

    return results;
  }

  return { evaluate };
}
