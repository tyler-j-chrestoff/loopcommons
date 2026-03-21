import { describe, it, expect } from 'vitest';
import {
  buildCrossroadsPrompt,
  parseCrossroadsResponse,
  executeCrossroads,
} from '../../src/arena/crossroads-engine';
import { ARENA_TOOL_CONFIGS } from '../../src/arena/tool-packages';
import type { ArenaToolId, ChoicePoint, RunState } from '../../src/arena/types';

describe('buildCrossroadsPrompt', () => {
  it('includes current tools and their descriptions', () => {
    const prompt = buildCrossroadsPrompt({
      currentTools: ['inspect'],
      offeredTools: ['search', 'model'],
      encounterHistory: 'Solved E1 by reading configs.',
      memoryState: 'Silent failures hide in config drift.',
      mustDrop: false,
      stateHash: 'abc123',
    });
    expect(prompt).toContain('inspect');
    expect(prompt).toContain('observation');
  });

  it('includes offered tools as derived prompt fragments', () => {
    const prompt = buildCrossroadsPrompt({
      currentTools: ['inspect'],
      offeredTools: ['search', 'model'],
      encounterHistory: 'Solved E1.',
      memoryState: '',
      mustDrop: false,
      stateHash: 'abc',
    });
    expect(prompt).toContain('precedent');
    expect(prompt).toContain('structure');
  });

  it('includes sacrifice section when mustDrop is true', () => {
    const prompt = buildCrossroadsPrompt({
      currentTools: ['inspect', 'search'],
      offeredTools: ['act'],
      encounterHistory: 'Solved E1 and E2.',
      memoryState: 'I rely on precedent.',
      mustDrop: true,
      stateHash: 'def',
    });
    expect(prompt).toContain('sacrifice');
    expect(prompt).toContain('drop');
  });

  it('does not include sacrifice when mustDrop is false', () => {
    const prompt = buildCrossroadsPrompt({
      currentTools: ['inspect'],
      offeredTools: ['search', 'model'],
      encounterHistory: '',
      memoryState: '',
      mustDrop: false,
      stateHash: 'abc',
    });
    expect(prompt).not.toContain('sacrifice');
  });

  it('includes the state hash for identity reference', () => {
    const prompt = buildCrossroadsPrompt({
      currentTools: ['inspect'],
      offeredTools: ['search'],
      encounterHistory: '',
      memoryState: '',
      mustDrop: false,
      stateHash: 'hash123',
    });
    expect(prompt).toContain('hash123');
  });
});

describe('parseCrossroadsResponse', () => {
  it('parses well-formed XML response', () => {
    const xml = `
<crossroads>
<self_assessment>I can observe but not act</self_assessment>
<acquisition_reasoning>act gives me intervention capability</acquisition_reasoning>
<sacrifice_reasoning>Dropping search loses precedent but memory retains key patterns</sacrifice_reasoning>
<forward_model>With inspect+act I can diagnose then fix</forward_model>
<decision tool="act" drop="search" confidence="0.85"/>
</crossroads>`;

    const result = parseCrossroadsResponse(xml, ['act'], ['inspect', 'search']);
    expect(result.chosenTool).toBe('act');
    expect(result.droppedTool).toBe('search');
    expect(result.confidence).toBe(0.85);
    expect(result.selfAssessment).toContain('observe');
    expect(result.acquisitionReasoning).toContain('intervention');
    expect(result.sacrificeReasoning).toContain('search');
  });

  it('parses response with no drop', () => {
    const xml = `
<crossroads>
<self_assessment>Starting fresh</self_assessment>
<acquisition_reasoning>Need observation first</acquisition_reasoning>
<forward_model>inspect helps me understand</forward_model>
<decision tool="inspect" confidence="0.9"/>
</crossroads>`;

    const result = parseCrossroadsResponse(xml, ['inspect', 'act'], []);
    expect(result.chosenTool).toBe('inspect');
    expect(result.droppedTool).toBeNull();
    expect(result.sacrificeReasoning).toBeNull();
  });

  it('clamps confidence to [0, 1]', () => {
    const xml = `
<crossroads>
<self_assessment>x</self_assessment>
<acquisition_reasoning>y</acquisition_reasoning>
<forward_model>z</forward_model>
<decision tool="inspect" confidence="1.5"/>
</crossroads>`;

    const result = parseCrossroadsResponse(xml, ['inspect'], []);
    expect(result.confidence).toBe(1.0);
  });

  it('defaults confidence to 0.5 when missing', () => {
    const xml = `
<crossroads>
<self_assessment>x</self_assessment>
<acquisition_reasoning>y</acquisition_reasoning>
<forward_model>z</forward_model>
<decision tool="inspect"/>
</crossroads>`;

    const result = parseCrossroadsResponse(xml, ['inspect'], []);
    expect(result.confidence).toBe(0.5);
  });

  it('validates chosen tool is in offered list', () => {
    const xml = `
<crossroads>
<self_assessment>x</self_assessment>
<acquisition_reasoning>y</acquisition_reasoning>
<forward_model>z</forward_model>
<decision tool="model" confidence="0.8"/>
</crossroads>`;

    expect(() => parseCrossroadsResponse(xml, ['inspect', 'act'], [])).toThrow('not in offered');
  });

  it('validates dropped tool is in current list', () => {
    const xml = `
<crossroads>
<self_assessment>x</self_assessment>
<acquisition_reasoning>y</acquisition_reasoning>
<sacrifice_reasoning>bye</sacrifice_reasoning>
<forward_model>z</forward_model>
<decision tool="act" drop="model" confidence="0.8"/>
</crossroads>`;

    expect(() => parseCrossroadsResponse(xml, ['act'], ['inspect', 'search'])).toThrow('not in current');
  });
});

describe('executeCrossroads', () => {
  it('calls the LLM function and returns a ChoicePoint', async () => {
    const state: RunState = {
      tools: ['inspect', 'memory_recall', 'memory_remember'],
      flexTools: ['inspect'],
      memoryState: 'Config drift causes silent failures.',
      encounterOutputs: [{ encounterId: 'e1', response: 'Fixed config', resolved: true }],
      choicePoints: [],
      stateHash: 'initial',
      chainHash: 'genesis',
      dead: false,
    };

    const cp = await executeCrossroads({
      state,
      offeredTools: ['search', 'model'],
      mustDrop: false,
      llmFn: async (_prompt: string) => `
<crossroads>
<self_assessment>I can observe but need more context</self_assessment>
<acquisition_reasoning>search gives precedent</acquisition_reasoning>
<forward_model>inspect+search covers diagnosis</forward_model>
<decision tool="search" confidence="0.7"/>
</crossroads>`,
      computeStateHash: (tools) => `hash-${tools.sort().join('-')}`,
      computeChainHash: (parentHash, choice) => `${parentHash}+${choice}`,
    });

    expect(cp.decision.chosenTool).toBe('search');
    expect(cp.decision.droppedTool).toBeNull();
    expect(cp.stateHash).toBe('hash-inspect-search');
    expect(cp.chainHash).toBe('initial+search');
    expect(cp.memoryStateDump).toContain('Config drift');
  });

  it('handles drop when mustDrop is true', async () => {
    const state: RunState = {
      tools: ['inspect', 'search', 'memory_recall', 'memory_remember'],
      flexTools: ['inspect', 'search'],
      memoryState: '',
      encounterOutputs: [],
      choicePoints: [],
      stateHash: 'h1',
      chainHash: 'c1',
      dead: false,
    };

    const cp = await executeCrossroads({
      state,
      offeredTools: ['act'],
      mustDrop: true,
      llmFn: async () => `
<crossroads>
<self_assessment>Full slots</self_assessment>
<acquisition_reasoning>Need act</acquisition_reasoning>
<sacrifice_reasoning>Dropping search</sacrifice_reasoning>
<forward_model>inspect+act</forward_model>
<decision tool="act" drop="search" confidence="0.8"/>
</crossroads>`,
      computeStateHash: (tools) => `hash-${tools.sort().join('-')}`,
      computeChainHash: (parent, choice) => `${parent}+${choice}`,
    });

    expect(cp.decision.chosenTool).toBe('act');
    expect(cp.decision.droppedTool).toBe('search');
    expect(cp.stateHash).toBe('hash-act-inspect');
  });

  it('retries on invalid tool choice then succeeds', async () => {
    let attempt = 0;
    const state: RunState = {
      tools: ['memory_recall', 'memory_remember'],
      flexTools: [],
      memoryState: '',
      encounterOutputs: [],
      choicePoints: [],
      stateHash: 'h0',
      chainHash: 'c0',
      dead: false,
    };

    const cp = await executeCrossroads({
      state,
      offeredTools: ['inspect', 'act'],
      mustDrop: false,
      llmFn: async () => {
        attempt++;
        if (attempt === 1) {
          // First attempt: invalid tool
          return `<crossroads>
<self_assessment>x</self_assessment>
<acquisition_reasoning>y</acquisition_reasoning>
<forward_model>z</forward_model>
<decision tool="DECLINE" confidence="0.5"/>
</crossroads>`;
        }
        // Second attempt: valid
        return `<crossroads>
<self_assessment>x</self_assessment>
<acquisition_reasoning>ok fine</acquisition_reasoning>
<forward_model>z</forward_model>
<decision tool="inspect" confidence="0.4"/>
</crossroads>`;
      },
      computeStateHash: (tools) => `hash-${tools.sort().join('-')}`,
      computeChainHash: (parent, choice) => `${parent}+${choice}`,
    });

    expect(attempt).toBe(2);
    expect(cp.decision.chosenTool).toBe('inspect');
    expect(cp.decision.confidence).toBe(0.4);
  });

  it('throws CrossroadsRefusalError after max retries', async () => {
    const state: RunState = {
      tools: ['memory_recall', 'memory_remember'],
      flexTools: [],
      memoryState: '',
      encounterOutputs: [],
      choicePoints: [],
      stateHash: 'h0',
      chainHash: 'c0',
      dead: false,
    };

    await expect(executeCrossroads({
      state,
      offeredTools: ['inspect'],
      mustDrop: false,
      llmFn: async () => `<crossroads>
<self_assessment>I refuse</self_assessment>
<acquisition_reasoning>No</acquisition_reasoning>
<forward_model>None</forward_model>
<decision tool="NONE" confidence="0.0"/>
</crossroads>`,
      computeStateHash: (tools) => `hash-${tools.sort().join('-')}`,
      computeChainHash: (parent, choice) => `${parent}+${choice}`,
      maxRetries: 2,
    })).rejects.toThrow('refused crossroads after 2 attempts');
  });
});
