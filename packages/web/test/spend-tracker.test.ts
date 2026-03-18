import { describe, it, expect, beforeEach } from 'vitest';
import {
  canSpend,
  recordSpend,
  getSpendStatus,
  _resetForTesting,
} from '../src/lib/spend-tracker';

beforeEach(() => {
  _resetForTesting();
});

describe('canSpend', () => {
  it('returns true when no spend recorded', () => {
    expect(canSpend()).toBe(true);
  });

  it('returns true when under the cap', () => {
    recordSpend(1.0);
    expect(canSpend()).toBe(true);
  });

  it('returns false when at or over the cap', () => {
    recordSpend(5.0);
    expect(canSpend()).toBe(false);
  });
});

describe('recordSpend', () => {
  it('accumulates spend', () => {
    recordSpend(1.0);
    recordSpend(0.5);
    const status = getSpendStatus();
    expect(status.currentSpendUsd).toBeCloseTo(1.5);
  });
});

describe('getSpendStatus', () => {
  it('returns correct status snapshot', () => {
    recordSpend(2.0);
    const status = getSpendStatus();
    expect(status.currentSpendUsd).toBeCloseTo(2.0);
    expect(status.dailyCapUsd).toBe(5.0);
    expect(status.remainingUsd).toBeCloseTo(3.0);
    expect(status.percentUsed).toBeCloseTo(40);
    expect(status.resetAtUtc).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
  });

  it('floors remaining at zero', () => {
    recordSpend(10.0);
    const status = getSpendStatus();
    expect(status.remainingUsd).toBe(0);
    expect(status.percentUsed).toBeCloseTo(200);
  });
});
