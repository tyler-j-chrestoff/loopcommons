import { describe, it, expect } from 'vitest';
import { formatCost, formatTokens, formatLatency } from '@/lib/format';

describe('formatCost', () => {
  it('returns $0.00 for zero', () => {
    expect(formatCost(0)).toBe('$0.00');
  });

  it('returns $0.00 for negative values', () => {
    expect(formatCost(-5)).toBe('$0.00');
  });

  it('returns $0.00 for NaN', () => {
    expect(formatCost(NaN)).toBe('$0.00');
  });

  it('returns $0.00 for Infinity', () => {
    expect(formatCost(Infinity)).toBe('$0.00');
  });

  it('formats very small costs with 6 decimal places', () => {
    expect(formatCost(0.0001)).toBe('$0.000100');
    expect(formatCost(0.0009)).toBe('$0.000900');
  });

  it('formats small costs with 4 decimal places', () => {
    expect(formatCost(0.005)).toBe('$0.0050');
    expect(formatCost(0.0099)).toBe('$0.0099');
  });

  it('formats normal costs with 3 decimal places', () => {
    expect(formatCost(0.01)).toBe('$0.010');
    expect(formatCost(1.234)).toBe('$1.234');
  });
});

describe('formatTokens', () => {
  it('returns raw number for small counts', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
  });

  it('returns 0 for NaN', () => {
    expect(formatTokens(NaN)).toBe('0');
  });

  it('returns 0 for negative values', () => {
    expect(formatTokens(-10)).toBe('0');
  });

  it('formats thousands with k suffix', () => {
    expect(formatTokens(1_000)).toBe('1.0k');
    expect(formatTokens(15_500)).toBe('15.5k');
    expect(formatTokens(999_999)).toBe('1000.0k');
  });

  it('formats millions with M suffix', () => {
    expect(formatTokens(1_000_000)).toBe('1.00M');
    expect(formatTokens(2_500_000)).toBe('2.50M');
  });
});

describe('formatLatency', () => {
  it('formats sub-second as ms', () => {
    expect(formatLatency(0)).toBe('0ms');
    expect(formatLatency(500)).toBe('500ms');
    expect(formatLatency(999)).toBe('999ms');
  });

  it('returns 0ms for NaN', () => {
    expect(formatLatency(NaN)).toBe('0ms');
  });

  it('returns 0ms for negative values', () => {
    expect(formatLatency(-100)).toBe('0ms');
  });

  it('formats seconds with one decimal', () => {
    expect(formatLatency(1_000)).toBe('1.0s');
    expect(formatLatency(1_500)).toBe('1.5s');
    expect(formatLatency(10_000)).toBe('10.0s');
  });
});
