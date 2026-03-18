import { describe, it, expect } from 'vitest';
import { TokenBudgetAccumulator } from '@/lib/token-budget';

describe('TokenBudgetAccumulator', () => {
  // -----------------------------------------------------------------------
  // Construction
  // -----------------------------------------------------------------------
  it('initialises with zero cumulative totals', () => {
    const acc = new TokenBudgetAccumulator();
    const cum = acc.getCumulative();
    expect(cum.inputTokens).toBe(0);
    expect(cum.outputTokens).toBe(0);
    expect(cum.cacheReadTokens).toBe(0);
    expect(cum.cacheCreationTokens).toBe(0);
    expect(cum.totalTokens).toBe(0);
  });

  it('defaults modelContextLimit to 200_000', () => {
    const acc = new TokenBudgetAccumulator();
    expect(acc.getBudgetPercent()).toBe(0);
  });

  it('accepts a custom modelContextLimit', () => {
    const acc = new TokenBudgetAccumulator({ modelContextLimit: 100_000 });
    acc.addActual('subagent', {
      inputTokens: 50_000,
      outputTokens: 0,
    });
    expect(acc.getBudgetPercent()).toBe(50);
  });

  // -----------------------------------------------------------------------
  // addActual — basic tracking
  // -----------------------------------------------------------------------
  it('tracks a single actual usage entry', () => {
    const acc = new TokenBudgetAccumulator();
    acc.addActual('amygdala', {
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 500,
      cacheCreationTokens: 100,
    });

    const cum = acc.getCumulative();
    expect(cum.inputTokens).toBe(1000);
    expect(cum.outputTokens).toBe(200);
    expect(cum.cacheReadTokens).toBe(500);
    expect(cum.cacheCreationTokens).toBe(100);
    expect(cum.totalTokens).toBe(1200); // input + output
  });

  it('accumulates across multiple turns from different sources', () => {
    const acc = new TokenBudgetAccumulator();

    // Amygdala pass
    acc.addActual('amygdala', {
      inputTokens: 1000,
      outputTokens: 200,
    });

    // Subagent response
    acc.addActual('subagent', {
      inputTokens: 2000,
      outputTokens: 500,
      cacheReadTokens: 800,
    });

    const cum = acc.getCumulative();
    expect(cum.inputTokens).toBe(3000);
    expect(cum.outputTokens).toBe(700);
    expect(cum.cacheReadTokens).toBe(800);
    expect(cum.totalTokens).toBe(3700);
  });

  // -----------------------------------------------------------------------
  // getTurns — per-turn breakdown
  // -----------------------------------------------------------------------
  it('records each turn with its source', () => {
    const acc = new TokenBudgetAccumulator();
    acc.addActual('amygdala', { inputTokens: 100, outputTokens: 50 });
    acc.addActual('subagent', { inputTokens: 200, outputTokens: 100 });

    const turns = acc.getTurns();
    expect(turns).toHaveLength(2);
    expect(turns[0].source).toBe('amygdala');
    expect(turns[0].actual.inputTokens).toBe(100);
    expect(turns[1].source).toBe('subagent');
    expect(turns[1].actual.inputTokens).toBe(200);
  });

  it('assigns sequential turnIndex values', () => {
    const acc = new TokenBudgetAccumulator();
    acc.addActual('amygdala', { inputTokens: 100, outputTokens: 50 });
    acc.addActual('orchestrator', { inputTokens: 0, outputTokens: 0 });
    acc.addActual('subagent', { inputTokens: 200, outputTokens: 100 });

    const turns = acc.getTurns();
    expect(turns.map(t => t.turnIndex)).toEqual([0, 1, 2]);
  });

  // -----------------------------------------------------------------------
  // getBudgetPercent
  // -----------------------------------------------------------------------
  it('returns 0 when no tokens used', () => {
    const acc = new TokenBudgetAccumulator();
    expect(acc.getBudgetPercent()).toBe(0);
  });

  it('calculates budget percent based on input tokens', () => {
    const acc = new TokenBudgetAccumulator({ modelContextLimit: 100_000 });
    acc.addActual('subagent', { inputTokens: 25_000, outputTokens: 5_000 });
    // Budget = input tokens / context limit = 25_000 / 100_000 = 25%
    // (output tokens don't count against context window — they're generated, not stored)
    expect(acc.getBudgetPercent()).toBe(25);
  });

  it('clamps budget percent to 100', () => {
    const acc = new TokenBudgetAccumulator({ modelContextLimit: 1000 });
    acc.addActual('subagent', { inputTokens: 2000, outputTokens: 500 });
    expect(acc.getBudgetPercent()).toBe(100);
  });

  // -----------------------------------------------------------------------
  // getCostEstimate
  // -----------------------------------------------------------------------
  it('calculates cost with default Haiku 4.5 pricing', () => {
    const acc = new TokenBudgetAccumulator();
    acc.addActual('subagent', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    // Haiku 4.5: $1.00/MTok input, $5.00/MTok output
    // Cost = 1.00 + 5.00 = 6.00
    expect(acc.getCostEstimate()).toBeCloseTo(6.0, 2);
  });

  it('applies cached token discount (cache reads at 10% input cost)', () => {
    const acc = new TokenBudgetAccumulator();
    // Anthropic reports: inputTokens = uncached new tokens (200K),
    // cacheReadTokens = tokens read from cache (800K). These are non-overlapping.
    acc.addActual('subagent', {
      inputTokens: 200_000,
      outputTokens: 0,
      cacheReadTokens: 800_000,
    });

    // 200K uncached @ $1.00/MTok = $0.20
    // 800K cached @ $0.10/MTok = $0.08
    // Total = $0.28
    expect(acc.getCostEstimate()).toBeCloseTo(0.28, 4);
  });

  it('accounts for cache creation tokens (1.25x input cost)', () => {
    const acc = new TokenBudgetAccumulator();
    // Anthropic reports: inputTokens = uncached new tokens (500K),
    // cacheCreationTokens = tokens written to cache (500K). Non-overlapping.
    acc.addActual('subagent', {
      inputTokens: 500_000,
      outputTokens: 0,
      cacheCreationTokens: 500_000,
      cacheReadTokens: 0,
    });

    // 500K uncached @ $1.00/MTok = $0.50
    // 500K cache creation @ $1.25/MTok = $0.625
    // Total = $1.125
    expect(acc.getCostEstimate()).toBeCloseTo(1.125, 4);
  });

  it('returns 0 cost when no tokens used', () => {
    const acc = new TokenBudgetAccumulator();
    expect(acc.getCostEstimate()).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Multi-source tracking
  // -----------------------------------------------------------------------
  it('separates amygdala overhead from subagent tokens', () => {
    const acc = new TokenBudgetAccumulator();

    acc.addActual('amygdala', { inputTokens: 1500, outputTokens: 300 });
    acc.addActual('subagent', { inputTokens: 3000, outputTokens: 800 });

    const turns = acc.getTurns();
    const amygdalaTurn = turns.find(t => t.source === 'amygdala')!;
    const subagentTurn = turns.find(t => t.source === 'subagent')!;

    expect(amygdalaTurn.actual.inputTokens).toBe(1500);
    expect(subagentTurn.actual.inputTokens).toBe(3000);
  });

  // -----------------------------------------------------------------------
  // getSnapshot — full state for SSE events
  // -----------------------------------------------------------------------
  it('returns a complete snapshot for SSE serialization', () => {
    const acc = new TokenBudgetAccumulator({ modelContextLimit: 200_000 });
    acc.addActual('amygdala', {
      inputTokens: 1500,
      outputTokens: 300,
      cacheReadTokens: 1000,
    });
    acc.addActual('subagent', {
      inputTokens: 3000,
      outputTokens: 800,
    });

    const snapshot = acc.getSnapshot();
    expect(snapshot.cumulative.inputTokens).toBe(4500);
    expect(snapshot.cumulative.outputTokens).toBe(1100);
    expect(snapshot.budgetPercent).toBeGreaterThan(0);
    expect(snapshot.budgetPercent).toBeLessThanOrEqual(100);
    expect(snapshot.costEstimate).toBeGreaterThan(0);
    expect(snapshot.modelContextLimit).toBe(200_000);
    expect(snapshot.turns).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  it('handles zero-token entries', () => {
    const acc = new TokenBudgetAccumulator();
    acc.addActual('orchestrator', { inputTokens: 0, outputTokens: 0 });

    const cum = acc.getCumulative();
    expect(cum.totalTokens).toBe(0);
    expect(acc.getBudgetPercent()).toBe(0);
    expect(acc.getCostEstimate()).toBe(0);
  });

  it('handles missing optional cache fields', () => {
    const acc = new TokenBudgetAccumulator();
    acc.addActual('subagent', { inputTokens: 1000, outputTokens: 500 });

    const cum = acc.getCumulative();
    expect(cum.cacheReadTokens).toBe(0);
    expect(cum.cacheCreationTokens).toBe(0);
  });

  it('handles many turns without overflow', () => {
    const acc = new TokenBudgetAccumulator();
    for (let i = 0; i < 100; i++) {
      acc.addActual('subagent', { inputTokens: 100, outputTokens: 50 });
    }

    const cum = acc.getCumulative();
    expect(cum.inputTokens).toBe(10_000);
    expect(cum.outputTokens).toBe(5_000);
    expect(cum.totalTokens).toBe(15_000);
  });
});
