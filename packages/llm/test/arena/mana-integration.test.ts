import { describe, it, expect } from 'vitest';
import { executeEncounter, type AgentFn } from '../../src/arena/encounter-engine';
import type { EncounterConfig, Sandbox } from '../../src/arena/types';
import type { ManaConfig } from '../../src/arena/mana';
import { createSandboxTools, createDoneTool } from '../../src/arena/sandbox-tools';
import { z } from 'zod';

function simpleEncounter(): EncounterConfig {
  return {
    id: 'test-enc',
    name: 'Test Encounter',
    setup: () => ({
      files: new Map([['config.yaml', 'key: value']]),
      services: new Map([
        ['app', { status: 'degraded', config: {}, metrics: { errors: 10 }, logs: ['ERROR: crash'] }],
      ]),
      incidentDb: [],
      dependencyGraph: {},
      commandLog: [],
    }),
    getPrompt: () => 'Fix the config.',
    evaluate: (sandbox) => {
      const restarted = sandbox.commandLog.some(c => c.startsWith('restart'));
      return {
        resolved: restarted,
        partial: false,
        score: restarted ? 1.0 : 0.0,
        details: restarted ? 'Fixed' : 'Not fixed',
      };
    },
  };
}

const defaultMana: ManaConfig = {
  explorationSlots: 2,
  toolCosts: { inspect: 1, search: 1, model: 2, act: 0, done: 0 },
};

describe('mana integration with encounter engine', () => {
  it('passes manaConfig through to agentFn', async () => {
    let receivedManaConfig: ManaConfig | undefined;

    const agentFn: AgentFn = async (input) => {
      receivedManaConfig = input.manaConfig;
      return { response: '', toolCalls: [] };
    };

    await executeEncounter({
      encounter: simpleEncounter(),
      tools: [],
      agentFn,
      maxSteps: 10,
      manaConfig: defaultMana,
    });

    expect(receivedManaConfig).toEqual(defaultMana);
  });

  it('does not pass manaConfig when not provided (backward compat)', async () => {
    let receivedManaConfig: ManaConfig | undefined = { explorationSlots: -1, toolCosts: {} };

    const agentFn: AgentFn = async (input) => {
      receivedManaConfig = input.manaConfig;
      return { response: '', toolCalls: [] };
    };

    await executeEncounter({
      encounter: simpleEncounter(),
      tools: [],
      agentFn,
      maxSteps: 10,
    });

    expect(receivedManaConfig).toBeUndefined();
  });

  it('mock agent can use manaConfig to filter its own tools', async () => {
    const { createManaState, prepareStep, consumeMana } = await import('../../src/arena/mana');

    // Agent uses tools created from the sandbox it receives (not pre-created)
    const agentFn: AgentFn = async ({ sandbox, manaConfig }) => {
      const tools = [...createSandboxTools(sandbox), createDoneTool()];
      const toolCalls: { toolName: string; input: Record<string, unknown>; output: string }[] = [];

      if (manaConfig) {
        const state = createManaState(manaConfig);
        const toolNames = tools.map(t => t.name);

        // Step 1: inspect (costs 1, 2 remaining → 1 remaining)
        let available = prepareStep(state, toolNames, manaConfig);
        expect(available).toContain('inspect');
        const inspectTool = tools.find(t => t.name === 'inspect')!;
        const inspectResult = await inspectTool.execute({ target: 'services' });
        toolCalls.push({ toolName: 'inspect', input: { target: 'services' }, output: inspectResult });
        consumeMana(state, 'inspect', manaConfig);

        // Step 2: inspect again (costs 1, 1 remaining → 0 remaining)
        available = prepareStep(state, toolNames, manaConfig);
        expect(available).toContain('inspect');
        const inspectResult2 = await inspectTool.execute({ target: 'services' });
        toolCalls.push({ toolName: 'inspect', input: { target: 'services' }, output: inspectResult2 });
        consumeMana(state, 'inspect', manaConfig);

        // Step 3: mana depleted — only act + done available
        available = prepareStep(state, toolNames, manaConfig);
        expect(available).not.toContain('inspect');
        expect(available).not.toContain('search');
        expect(available).not.toContain('model');
        expect(available).toContain('act');
        expect(available).toContain('done');

        // Act — operates on the encounter's sandbox
        const actTool = tools.find(t => t.name === 'act')!;
        const actResult = await actTool.execute({ command: 'restart app' });
        toolCalls.push({ toolName: 'act', input: { command: 'restart app' }, output: actResult });

        // Done
        const doneTool = tools.find(t => t.name === 'done')!;
        const doneResult = await doneTool.execute({});
        toolCalls.push({ toolName: 'done', input: {}, output: doneResult });
      }

      return { response: '', toolCalls };
    };

    const result = await executeEncounter({
      encounter: simpleEncounter(),
      tools: [], // agent creates its own tools from sandbox
      agentFn,
      maxSteps: 10,
      manaConfig: defaultMana,
    });

    expect(result.encounterResult.resolved).toBe(true);
    expect(result.steps.map(s => s.toolName)).toEqual(['inspect', 'inspect', 'act', 'done']);
  });

  it('encounter works without manaConfig (backward compatible)', async () => {
    const agentFn: AgentFn = async ({ sandbox }) => {
      // Agent uses sandbox directly — the encounter engine's sandbox
      sandbox.commandLog.push('restart app');
      return {
        response: 'Fixed it.',
        toolCalls: [{ toolName: 'act', input: { command: 'restart app' }, output: 'Service app restarted.' }],
      };
    };

    const result = await executeEncounter({
      encounter: simpleEncounter(),
      tools: [],
      agentFn,
      maxSteps: 10,
    });

    expect(result.encounterResult.resolved).toBe(true);
  });
});
