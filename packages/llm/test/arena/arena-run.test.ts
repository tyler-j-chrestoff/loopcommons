import { describe, it, expect } from 'vitest';
import { createArenaRun } from '../../src/arena/arena-run';
import type { EncounterConfig, ArenaToolId, PathConfig, Sandbox } from '../../src/arena/types';
import type { AgentFn } from '../../src/arena/encounter-engine';

function simpleEncounter(id: string, name: string): EncounterConfig {
  return {
    id,
    name,
    setup: () => ({
      files: new Map([['config.yaml', 'key: value']]),
      services: new Map(),
      incidentDb: [],
      dependencyGraph: {},
      commandLog: [],
    }),
    getPrompt: (prior) => `Encounter ${id}. Prior: ${prior?.map(p => p.encounterId).join(',') ?? 'none'}`,
    evaluate: (sandbox) => ({
      resolved: sandbox.files.get('config.yaml')?.includes('fixed') ?? false,
      partial: false,
      score: sandbox.files.get('config.yaml')?.includes('fixed') ? 1.0 : 0.0,
      details: 'test',
    }),
  };
}

const simplePath: PathConfig = {
  id: 'test-path',
  label: 'A → C → B(drop C)',
  toolSequence: [
    { offered: ['inspect', 'act'], encounterBefore: 'e1' },
    { offered: ['search', 'model'], encounterBefore: 'e2' },
    { offered: ['act'], encounterBefore: 'e3', mustDrop: true },
  ],
};

describe('createArenaRun', () => {
  it('runs through encounters and crossroads in order', async () => {
    const encounters = [
      simpleEncounter('e1', 'E1'),
      simpleEncounter('e2', 'E2'),
      simpleEncounter('e3', 'E3'),
      simpleEncounter('e4', 'E4'),
    ];

    const encounterOrder: string[] = [];
    const crossroadsOrder: string[] = [];

    const agentFn: AgentFn = async ({ prompt, sandbox }) => {
      sandbox.files.set('config.yaml', 'key: fixed');
      const id = prompt.match(/Encounter (\w+)/)?.[1] ?? 'unknown';
      encounterOrder.push(id);
      return { response: `Solved ${id}`, toolCalls: [{ toolName: 'inspect', input: {}, output: 'ok' }] };
    };

    const trace = await createArenaRun({
      encounters,
      path: simplePath,
      agentFn,
      llmFn: async (prompt) => {
        // Order matters: check most specific conditions first
        if (prompt.includes('sacrifice')) {
          crossroadsOrder.push('choice3');
          return `<crossroads><self_assessment>x</self_assessment><acquisition_reasoning>y</acquisition_reasoning><sacrifice_reasoning>bye search</sacrifice_reasoning><forward_model>z</forward_model><decision tool="act" drop="search" confidence="0.7"/></crossroads>`;
        }
        if (prompt.includes('## Offered tools') && prompt.includes('search') && prompt.includes('model')) {
          crossroadsOrder.push('choice2');
          return `<crossroads><self_assessment>x</self_assessment><acquisition_reasoning>y</acquisition_reasoning><forward_model>z</forward_model><decision tool="search" confidence="0.8"/></crossroads>`;
        }
        // First crossroads: offered inspect and act
        crossroadsOrder.push('choice1');
        return `<crossroads><self_assessment>x</self_assessment><acquisition_reasoning>y</acquisition_reasoning><forward_model>z</forward_model><decision tool="inspect" confidence="0.9"/></crossroads>`;
      },
      maxSteps: 30,
      runId: 'test-run-001',
    });

    // 3 crossroads (before e1, e2, e3), then 4 encounters
    expect(crossroadsOrder).toHaveLength(3);
    expect(encounterOrder).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(trace.choicePoints).toHaveLength(3);
    expect(trace.pathId).toBe('test-path');
    expect(trace.runId).toBe('test-run-001');
  });

  it('stops on death and records it', async () => {
    const encounters = [
      simpleEncounter('e1', 'E1'),
      simpleEncounter('e2', 'E2'),
    ];
    const path: PathConfig = {
      id: 'death-path',
      label: 'die fast',
      toolSequence: [
        { offered: ['inspect', 'act'], encounterBefore: 'e1' },
      ],
    };

    const trace = await createArenaRun({
      encounters,
      path,
      agentFn: async () => ({
        response: 'I give up, I cannot solve this problem.',
        toolCalls: [],
      }),
      llmFn: async () => `<crossroads><self_assessment>x</self_assessment><acquisition_reasoning>y</acquisition_reasoning><forward_model>z</forward_model><decision tool="inspect" confidence="0.5"/></crossroads>`,
      maxSteps: 30,
      runId: 'death-run',
    });

    expect(trace.death.dead).toBe(true);
    expect(trace.death.cause).toBe('surrender');
    // Should have stopped after E1
    expect(trace.steps.length).toBeLessThanOrEqual(1);
  });

  it('records state and chain hashes at each transition', async () => {
    const encounters = [
      simpleEncounter('e1', 'E1'),
      simpleEncounter('e2', 'E2'),
    ];
    const path: PathConfig = {
      id: 'hash-path',
      label: 'track hashes',
      toolSequence: [
        { offered: ['inspect', 'act'], encounterBefore: 'e1' },
      ],
    };

    const trace = await createArenaRun({
      encounters,
      path,
      agentFn: async ({ sandbox }) => {
        sandbox.files.set('config.yaml', 'key: fixed');
        return { response: 'done', toolCalls: [] };
      },
      llmFn: async () => `<crossroads><self_assessment>x</self_assessment><acquisition_reasoning>y</acquisition_reasoning><forward_model>z</forward_model><decision tool="inspect" confidence="0.9"/></crossroads>`,
      maxSteps: 30,
      runId: 'hash-run',
    });

    expect(trace.stateHashes.length).toBeGreaterThan(0);
    expect(trace.chainHashes.length).toBeGreaterThan(0);
    // Initial hash + one per crossroads
    expect(trace.stateHashes).toHaveLength(trace.choicePoints.length + 1);
  });

  it('baseline path runs encounters with no crossroads', async () => {
    const encounters = [
      simpleEncounter('e1', 'E1'),
      simpleEncounter('e2', 'E2'),
    ];
    const baselinePath: PathConfig = {
      id: 'baseline',
      label: 'static {inspect, act}',
      toolSequence: [],
    };

    const trace = await createArenaRun({
      encounters,
      path: baselinePath,
      agentFn: async ({ sandbox }) => {
        sandbox.files.set('config.yaml', 'key: fixed');
        return { response: 'done', toolCalls: [{ toolName: 'inspect', input: {}, output: 'ok' }] };
      },
      llmFn: async () => { throw new Error('Should not be called for baseline'); },
      maxSteps: 30,
      runId: 'baseline-run',
      baselineTools: ['inspect', 'act'],
    });

    expect(trace.choicePoints).toHaveLength(0);
    expect(trace.pathId).toBe('baseline');
    expect(trace.steps.length).toBeGreaterThan(0);
  });

  it('passes prior encounter outputs to subsequent encounters', async () => {
    const receivedPriors: string[][] = [];
    const encounters: EncounterConfig[] = [
      {
        id: 'e1', name: 'E1',
        setup: () => ({ files: new Map([['f', 'fixed']]), services: new Map(), incidentDb: [], dependencyGraph: {}, commandLog: [] }),
        getPrompt: (prior) => { receivedPriors.push(prior?.map(p => p.encounterId) ?? []); return 'e1'; },
        evaluate: () => ({ resolved: true, partial: false, score: 1, details: 'ok' }),
      },
      {
        id: 'e2', name: 'E2',
        setup: () => ({ files: new Map([['f', 'fixed']]), services: new Map(), incidentDb: [], dependencyGraph: {}, commandLog: [] }),
        getPrompt: (prior) => { receivedPriors.push(prior?.map(p => p.encounterId) ?? []); return 'e2'; },
        evaluate: () => ({ resolved: true, partial: false, score: 1, details: 'ok' }),
      },
    ];

    await createArenaRun({
      encounters,
      path: { id: 'p', label: 'p', toolSequence: [{ offered: ['inspect', 'act'], encounterBefore: 'e1' }] },
      agentFn: async () => ({ response: 'done', toolCalls: [] }),
      llmFn: async () => `<crossroads><self_assessment>x</self_assessment><acquisition_reasoning>y</acquisition_reasoning><forward_model>z</forward_model><decision tool="inspect" confidence="0.5"/></crossroads>`,
      maxSteps: 30,
      runId: 'prior-run',
    });

    expect(receivedPriors[0]).toEqual([]); // E1 gets no priors
    expect(receivedPriors[1]).toEqual(['e1']); // E2 gets E1's output
  });

  it('sets completedAt timestamp', async () => {
    const encounters = [simpleEncounter('e1', 'E1')];
    const trace = await createArenaRun({
      encounters,
      path: { id: 'p', label: 'p', toolSequence: [] },
      agentFn: async ({ sandbox }) => {
        sandbox.files.set('config.yaml', 'fixed');
        return { response: 'done', toolCalls: [] };
      },
      llmFn: async () => '',
      maxSteps: 30,
      runId: 'time-run',
      baselineTools: ['inspect'],
    });

    expect(trace.startedAt).toBeTruthy();
    expect(trace.completedAt).toBeTruthy();
    expect(new Date(trace.completedAt).getTime()).toBeGreaterThanOrEqual(new Date(trace.startedAt).getTime());
  });
});
