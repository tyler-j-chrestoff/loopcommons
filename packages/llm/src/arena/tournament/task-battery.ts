/**
 * Task battery — evaluates tournament agents against encounters.
 *
 * Bridges the tournament system to the existing encounter engine.
 * Each agent is evaluated sequentially through all encounters,
 * with tools scoped to the agent's current tool set.
 */

import type { EncounterConfig, StepRecord } from '../types';
import type { AgentFn, ExecuteEncounterOutput } from '../encounter-engine';
import { executeEncounter } from '../encounter-engine';
import { createSandboxTools, createDoneTool } from '../sandbox-tools';
import type { TournamentAgent, TaskResult } from './types';
import type { ManaConfig } from '../mana';
import type { OnEncounterComplete } from './trace-writer';
import { createInMemoryState, type InMemoryState } from '@loopcommons/memory/in-memory';
import { formatMemoryContext } from '@loopcommons/memory';

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

export type ReflectionLlmFn = (prompt: string) => Promise<string>;

type TaskBatteryConfig = {
  encounters: EncounterConfig[];
  agentFnFactory: (agent: TournamentAgent) => AgentFn;
  maxStepsPerEncounter: number;
  manaConfig?: ManaConfig;
  onEncounterComplete?: OnEncounterComplete;
  enableMemory?: boolean;
  memoryRecallLimit?: number;
  reflectionLlmFn?: ReflectionLlmFn;
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
function buildReflectionPrompt(
  encounterPrompt: string,
  steps: StepRecord[],
  resolved: boolean,
  score: number,
): string {
  const trajectory = steps
    .map((s, i) => `${i + 1}. ${s.toolName}(${JSON.stringify(s.toolInput)}) → ${s.toolOutput.slice(0, 200)}`)
    .join('\n');

  return [
    'You just completed a DevOps encounter. Summarize what you learned in one concise sentence.',
    '',
    `Encounter: ${encounterPrompt.slice(0, 500)}`,
    '',
    `Steps taken:\n${trajectory}`,
    '',
    `Outcome: ${resolved ? 'resolved' : 'unresolved'} (score: ${score})`,
    '',
    'Respond with ONLY a single sentence describing the key lesson or insight.',
  ].join('\n');
}

export function createTaskBattery(config: TaskBatteryConfig): TaskBattery {
  const recallLimit = config.memoryRecallLimit ?? 5;
  const memoryEnabled = !!config.enableMemory;

  async function recallMemoryContext(state: InMemoryState): Promise<string | undefined> {
    const memories = await state.recall({ limit: recallLimit });
    if (memories.length === 0) return undefined;
    return formatMemoryContext(memories);
  }

  async function reflectOnEncounter(
    state: InMemoryState,
    encounterPrompt: string,
    output: ExecuteEncounterOutput,
  ): Promise<void> {
    if (!config.reflectionLlmFn) return;

    const prompt = buildReflectionPrompt(
      encounterPrompt,
      output.steps,
      output.encounterResult.resolved,
      output.encounterResult.score,
    );

    const insight = await config.reflectionLlmFn(prompt);
    if (!insight.trim()) return;

    await state.remember({
      type: 'learning',
      topic: 'encounter-reflection',
      insight: insight.trim().slice(0, 500),
      applicableTo: ['arena'],
    });
  }

  async function evaluate(agent: TournamentAgent): Promise<TaskResult[]> {
    const agentFn = config.agentFnFactory(agent);
    const results: TaskResult[] = [];

    // Shared InMemoryState across all encounters for this agent
    const memoryState = memoryEnabled
      ? createInMemoryState(agent.memoryState)
      : null;

    for (const encounter of config.encounters) {
      const sandbox = encounter.setup();
      const sandboxTools = [
        ...createSandboxTools(sandbox).filter(t => agent.tools.includes(t.name as any)),
        createDoneTool(),
      ];

      // Recall memories before encounter (free — no mana cost)
      const memoryContext = memoryState
        ? await recallMemoryContext(memoryState)
        : undefined;

      const encounterPrompt = encounter.getPrompt();

      const output = await executeEncounter({
        encounter: {
          ...encounter,
          setup: () => sandbox,
        },
        tools: sandboxTools,
        agentFn,
        maxSteps: config.maxStepsPerEncounter,
        manaConfig: config.manaConfig,
        memoryContext,
      });
      results.push(encounterResultToTaskResult(encounter.id, output));

      // Out-of-band reflection — outside mana/step limits
      if (memoryState) {
        await reflectOnEncounter(memoryState, encounterPrompt, output);
      }

      if (config.onEncounterComplete) {
        config.onEncounterComplete(agent.id, encounter.id, output);
      }
    }

    // Persist updated memory back to agent
    if (memoryState) {
      agent.memoryState = memoryState.serialize();
    }

    return results;
  }

  return { evaluate };
}
