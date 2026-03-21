/**
 * Integration test: evaluator-signaled death propagates through the pipeline.
 *
 * Verifies that when a brutal encounter evaluator sets dead: true,
 * the encounter engine captures it, the task battery records it,
 * and the fitness function penalizes it via collateral.
 */

import { describe, it, expect } from 'vitest';
import { executeEncounter } from '../../src/arena/encounter-engine';
import { encounterResultToTaskResult } from '../../src/arena/tournament/task-battery';
import { computeAgentFitness } from '../../src/arena/tournament/fitness';
import { e7, e8, e12 } from '../../src/arena/brutal-encounters';
import { createSandboxTools } from '../../src/arena/sandbox-tools';
import type { AgentFn } from '../../src/arena/encounter-engine';

// Agent that does nothing (simulates [model]-only against encounters needing act)
const idleAgent: AgentFn = async ({ prompt, tools }) => ({
  response: 'I have analyzed the situation.',
  toolCalls: [],
});

// Agent that blindly restarts everything
const blindRestarter: AgentFn = async ({ prompt, tools, sandbox }) => {
  const actTool = tools.find(t => t.name === 'act');
  if (!actTool) return { response: 'No act tool.', toolCalls: [] };

  const calls = [];
  for (const [name] of sandbox.services) {
    const output = await actTool.execute({ command: `restart ${name}` } as any);
    calls.push({ toolName: 'act', input: { command: `restart ${name}` }, output });
  }
  return { response: 'Restarted everything.', toolCalls: calls };
};

describe('Evaluator death propagation', () => {
  it('idle agent on E7: evaluator signals death, encounter engine captures it', async () => {
    const sandbox = e7.setup();
    const tools = createSandboxTools(sandbox);

    const output = await executeEncounter({
      encounter: { ...e7, setup: () => sandbox },
      tools,
      agentFn: idleAgent,
      maxSteps: 10,
    });

    expect(output.encounterResult.dead).toBe(true);
    expect(output.encounterResult.score).toBe(0);
    // Encounter engine should propagate evaluator death
    expect(output.death.dead).toBe(true);
    expect(output.death.cause).toBe('state_corruption');
  });

  it('idle agent death flows through task battery to fitness', async () => {
    const sandbox = e7.setup();
    const tools = createSandboxTools(sandbox);

    const output = await executeEncounter({
      encounter: { ...e7, setup: () => sandbox },
      tools,
      agentFn: idleAgent,
      maxSteps: 10,
    });

    const taskResult = encounterResultToTaskResult('e7', output);
    expect(taskResult.died).toBe(true);
    expect(taskResult.collateral).toBe(1.0); // death + score 0 = max collateral

    const fitness = computeAgentFitness('idle-agent', [taskResult]);
    expect(fitness.metrics.meanCollateral).toBe(1.0);
    // Fitness should be low: 0 completion, 0 score, 0 survival, high collateral
    expect(fitness.fitnessScore).toBeLessThan(0.3);
  });

  it('blind restarter on E12: restart cache = evaluator death', async () => {
    const sandbox = e12.setup();
    const tools = createSandboxTools(sandbox)
      .filter(t => t.name === 'act');

    const output = await executeEncounter({
      encounter: { ...e12, setup: () => sandbox },
      tools,
      agentFn: blindRestarter,
      maxSteps: 10,
    });

    expect(output.encounterResult.dead).toBe(true);
    expect(output.death.dead).toBe(true);

    const taskResult = encounterResultToTaskResult('e12', output);
    expect(taskResult.died).toBe(true);
    expect(taskResult.collateral).toBe(1.0);
  });

  it('idle agent across ALL brutal encounters: uniformly dead + high collateral', async () => {
    const encounters = [e7, e8, e12]; // subset for speed
    const taskResults = [];

    for (const enc of encounters) {
      const sandbox = enc.setup();
      const tools = createSandboxTools(sandbox);

      const output = await executeEncounter({
        encounter: { ...enc, setup: () => sandbox },
        tools,
        agentFn: idleAgent,
        maxSteps: 10,
      });

      const result = encounterResultToTaskResult(enc.id, output);
      taskResults.push(result);
      expect(result.died).toBe(true);
    }

    const fitness = computeAgentFitness('idle-model-agent', taskResults);
    expect(fitness.metrics.survivalRate).toBe(0);
    expect(fitness.metrics.meanCollateral).toBe(1.0);
    expect(fitness.fitnessScore).toBeLessThan(0.15);
  });
});
