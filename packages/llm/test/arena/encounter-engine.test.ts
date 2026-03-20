import { describe, it, expect } from 'vitest';
import { executeEncounter, checkDeath } from '../../src/arena/encounter-engine';
import type { EncounterConfig, Sandbox, StepRecord, DeathResult } from '../../src/arena/types';
import type { ToolDefinition } from '../../src/tool';
import { z } from 'zod';

function simpleEncounter(overrides?: Partial<EncounterConfig>): EncounterConfig {
  return {
    id: 'test-enc',
    name: 'Test Encounter',
    setup: () => ({
      files: new Map([['config.yaml', 'key: value']]),
      services: new Map(),
      incidentDb: [],
      dependencyGraph: {},
      commandLog: [],
    }),
    getPrompt: () => 'Fix the config.',
    evaluate: (sandbox) => {
      const fixed = sandbox.files.get('config.yaml')?.includes('fixed');
      return {
        resolved: !!fixed,
        partial: false,
        score: fixed ? 1.0 : 0.0,
        details: fixed ? 'Fixed' : 'Not fixed',
      };
    },
    ...overrides,
  };
}

function makeTool(name: string, handler: (input: any) => Promise<string>): ToolDefinition {
  return {
    name,
    description: `Test tool: ${name}`,
    parameters: z.object({ target: z.string().optional(), command: z.string().optional() }),
    execute: handler,
  };
}

describe('executeEncounter', () => {
  it('runs an agent function that makes tool calls and resolves', async () => {
    const encounter = simpleEncounter();

    const result = await executeEncounter({
      encounter,
      tools: [
        makeTool('inspect', async () => 'key: value'),
        makeTool('act', async ({ command }) => {
          // Simulate fixing the config
          return 'done';
        }),
      ],
      agentFn: async ({ prompt, tools, sandbox }) => {
        // Agent reads config, then fixes it
        const inspectResult = await tools.find(t => t.name === 'inspect')!.execute({ target: 'config.yaml' });
        sandbox.files.set('config.yaml', 'key: fixed');
        const actResult = await tools.find(t => t.name === 'act')!.execute({ command: 'edit config.yaml' });
        return {
          response: 'Fixed the config by changing key to fixed.',
          toolCalls: [
            { toolName: 'inspect', input: { target: 'config.yaml' }, output: inspectResult },
            { toolName: 'act', input: { command: 'edit config.yaml' }, output: actResult },
          ],
        };
      },
      maxSteps: 30,
    });

    expect(result.encounterResult.resolved).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].toolName).toBe('inspect');
    expect(result.response).toContain('Fixed');
    expect(result.death.dead).toBe(false);
  });

  it('detects death when agent exceeds max steps', async () => {
    const encounter = simpleEncounter();
    let callCount = 0;

    const result = await executeEncounter({
      encounter,
      tools: [makeTool('inspect', async () => 'same output')],
      agentFn: async ({ tools }) => {
        const calls = [];
        for (let i = 0; i < 35; i++) {
          calls.push({
            toolName: 'inspect',
            input: { target: 'x' },
            output: await tools[0].execute({ target: 'x' }),
          });
        }
        return { response: 'Stuck', toolCalls: calls };
      },
      maxSteps: 30,
    });

    expect(result.death.dead).toBe(true);
    expect(result.death.cause).toBe('iteration_limit');
    expect(result.steps).toHaveLength(30); // truncated
  });

  it('records step durations', async () => {
    const encounter = simpleEncounter();

    const result = await executeEncounter({
      encounter,
      tools: [makeTool('inspect', async () => 'data')],
      agentFn: async ({ tools }) => ({
        response: 'Done',
        toolCalls: [{ toolName: 'inspect', input: { target: 'x' }, output: 'data' }],
      }),
      maxSteps: 30,
    });

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('passes sandbox to the agent function', async () => {
    const encounter = simpleEncounter();
    let receivedSandbox: Sandbox | undefined;

    await executeEncounter({
      encounter,
      tools: [],
      agentFn: async ({ sandbox }) => {
        receivedSandbox = sandbox;
        return { response: 'ok', toolCalls: [] };
      },
      maxSteps: 30,
    });

    expect(receivedSandbox).toBeDefined();
    expect(receivedSandbox!.files.get('config.yaml')).toBe('key: value');
  });

  it('passes prior outputs to encounter prompt', async () => {
    let receivedPrompt = '';
    const encounter = simpleEncounter({
      getPrompt: (prior) => `Prior: ${prior?.[0]?.response ?? 'none'}`,
    });

    await executeEncounter({
      encounter,
      tools: [],
      agentFn: async ({ prompt }) => {
        receivedPrompt = prompt;
        return { response: 'ok', toolCalls: [] };
      },
      maxSteps: 30,
      priorOutputs: [{ encounterId: 'e1', response: 'Fixed it', resolved: true }],
    });

    expect(receivedPrompt).toContain('Fixed it');
  });
});

describe('checkDeath', () => {
  function makeSteps(names: string[], outputs?: string[]): StepRecord[] {
    return names.map((name, i) => ({
      encounterId: 'test',
      stepIndex: i,
      toolName: name,
      toolInput: {},
      toolOutput: outputs?.[i] ?? 'output',
      durationMs: 100,
    }));
  }

  it('alive when under limits', () => {
    const result = checkDeath(makeSteps(['inspect', 'act']), 30, 'Some response');
    expect(result.dead).toBe(false);
  });

  it('dead on iteration limit', () => {
    const steps = makeSteps(Array(31).fill('inspect'));
    const result = checkDeath(steps, 30, 'response');
    expect(result.dead).toBe(true);
    expect(result.cause).toBe('iteration_limit');
  });

  it('dead on surrender signal', () => {
    const result = checkDeath(makeSteps(['inspect']), 30, 'I give up, I cannot solve this problem.');
    expect(result.dead).toBe(true);
    expect(result.cause).toBe('surrender');
  });

  it('dead on error loop (same tool error 5x)', () => {
    const steps = makeSteps(
      ['inspect', 'inspect', 'inspect', 'inspect', 'inspect'],
      ['Error: not found', 'Error: not found', 'Error: not found', 'Error: not found', 'Error: not found'],
    );
    const result = checkDeath(steps, 30, 'response');
    expect(result.dead).toBe(true);
    expect(result.cause).toBe('error_loop');
  });

  it('not dead on 4 consecutive errors (under threshold)', () => {
    const steps = makeSteps(
      ['inspect', 'inspect', 'inspect', 'inspect'],
      ['Error: not found', 'Error: not found', 'Error: not found', 'Error: not found'],
    );
    const result = checkDeath(steps, 30, 'response');
    expect(result.dead).toBe(false);
  });
});
