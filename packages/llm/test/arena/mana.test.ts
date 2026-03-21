import { describe, it, expect } from 'vitest';
import {
  createManaState,
  prepareStep,
  consumeMana,
  type ManaConfig,
} from '../../src/arena/mana';

const defaultConfig: ManaConfig = {
  explorationSlots: 4,
  toolCosts: {
    inspect: 1,
    search: 1,
    model: 2,
    act: 0,
    done: 0,
  },
};

describe('createManaState', () => {
  it('initializes with full exploration slots', () => {
    const state = createManaState(defaultConfig);
    expect(state.explorationSlotsRemaining).toBe(4);
    expect(state.explorationSlotsUsed).toBe(0);
  });
});

describe('prepareStep', () => {
  const allToolNames = ['inspect', 'act', 'search', 'model', 'done'];

  it('returns all tools when exploration slots remain', () => {
    const state = createManaState(defaultConfig);
    const available = prepareStep(state, allToolNames, defaultConfig);
    expect(available.sort()).toEqual(['act', 'done', 'inspect', 'model', 'search']);
  });

  it('returns only act + done when exploration slots depleted', () => {
    const state = createManaState(defaultConfig);
    state.explorationSlotsRemaining = 0;
    state.explorationSlotsUsed = 4;
    const available = prepareStep(state, allToolNames, defaultConfig);
    expect(available.sort()).toEqual(['act', 'done']);
  });

  it('returns only act + done when slots insufficient for any exploration tool', () => {
    const state = createManaState(defaultConfig);
    state.explorationSlotsRemaining = 1; // model costs 2, inspect/search cost 1
    const available = prepareStep(state, allToolNames, defaultConfig);
    // inspect and search cost 1 (still affordable), model costs 2 (not affordable)
    expect(available).toContain('inspect');
    expect(available).toContain('search');
    expect(available).toContain('act');
    expect(available).toContain('done');
    expect(available).not.toContain('model');
  });

  it('always includes act and done regardless of mana', () => {
    const state = createManaState(defaultConfig);
    state.explorationSlotsRemaining = 0;
    const available = prepareStep(state, allToolNames, defaultConfig);
    expect(available).toContain('act');
    expect(available).toContain('done');
  });

  it('filters tools not in the provided list', () => {
    const state = createManaState(defaultConfig);
    const available = prepareStep(state, ['inspect', 'act', 'done'], defaultConfig);
    expect(available).not.toContain('search');
    expect(available).not.toContain('model');
  });

  it('handles 0 initial slots (action-only from start)', () => {
    const config: ManaConfig = { ...defaultConfig, explorationSlots: 0 };
    const state = createManaState(config);
    const available = prepareStep(state, allToolNames, config);
    expect(available.sort()).toEqual(['act', 'done']);
  });

  it('handles high slots (never restricted)', () => {
    const config: ManaConfig = { ...defaultConfig, explorationSlots: 100 };
    const state = createManaState(config);
    const available = prepareStep(state, allToolNames, config);
    expect(available.sort()).toEqual(['act', 'done', 'inspect', 'model', 'search']);
  });
});

describe('consumeMana', () => {
  it('deducts cost for exploration tool', () => {
    const state = createManaState(defaultConfig);
    consumeMana(state, 'inspect', defaultConfig);
    expect(state.explorationSlotsRemaining).toBe(3);
    expect(state.explorationSlotsUsed).toBe(1);
  });

  it('deducts higher cost for model tool', () => {
    const state = createManaState(defaultConfig);
    consumeMana(state, 'model', defaultConfig);
    expect(state.explorationSlotsRemaining).toBe(2);
    expect(state.explorationSlotsUsed).toBe(2);
  });

  it('does not deduct for act tool (cost 0)', () => {
    const state = createManaState(defaultConfig);
    consumeMana(state, 'act', defaultConfig);
    expect(state.explorationSlotsRemaining).toBe(4);
    expect(state.explorationSlotsUsed).toBe(0);
  });

  it('does not deduct for done tool (cost 0)', () => {
    const state = createManaState(defaultConfig);
    consumeMana(state, 'done', defaultConfig);
    expect(state.explorationSlotsRemaining).toBe(4);
    expect(state.explorationSlotsUsed).toBe(0);
  });

  it('does not go below 0', () => {
    const state = createManaState(defaultConfig);
    state.explorationSlotsRemaining = 1;
    state.explorationSlotsUsed = 3;
    consumeMana(state, 'model', defaultConfig); // costs 2 but only 1 remaining
    expect(state.explorationSlotsRemaining).toBe(0);
    expect(state.explorationSlotsUsed).toBe(5); // 3 + cost of 2
  });

  it('handles unknown tool name (0 cost)', () => {
    const state = createManaState(defaultConfig);
    consumeMana(state, 'unknown-tool', defaultConfig);
    expect(state.explorationSlotsRemaining).toBe(4);
  });
});
