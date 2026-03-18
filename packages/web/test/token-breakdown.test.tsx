import { render, screen, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, afterEach } from 'vitest';
import type { Turn } from '@/lib/token-budget';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    turnIndex: 0,
    source: 'subagent',
    actual: {
      inputTokens: 5_000,
      outputTokens: 2_000,
      cacheReadTokens: 1_000,
      cacheCreationTokens: 200,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TokenBreakdown tests
// ---------------------------------------------------------------------------

import { TokenBreakdown } from '@/components/TokenBreakdown';

describe('TokenBreakdown', () => {
  afterEach(() => cleanup());

  it('renders nothing when turns is empty', () => {
    const { container } = render(<TokenBreakdown turns={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a row for each turn', () => {
    const turns = [
      makeTurn({ turnIndex: 0, source: 'amygdala' }),
      makeTurn({ turnIndex: 1, source: 'subagent' }),
    ];
    render(<TokenBreakdown turns={turns} />);
    expect(screen.getByText('amygdala')).toBeDefined();
    expect(screen.getByText('subagent')).toBeDefined();
  });

  it('shows input and output token counts', () => {
    render(<TokenBreakdown turns={[makeTurn({ actual: { inputTokens: 12_345, outputTokens: 3_456, cacheReadTokens: 0, cacheCreationTokens: 0 } })]} />);
    expect(screen.getByText('12.3k')).toBeDefined();
    expect(screen.getByText('3.5k')).toBeDefined();
  });

  it('shows cache indicator when cache tokens present', () => {
    render(<TokenBreakdown turns={[makeTurn({ actual: { inputTokens: 5_000, outputTokens: 2_000, cacheReadTokens: 3_000, cacheCreationTokens: 0 } })]} />);
    expect(screen.getByText('3.0k cached')).toBeDefined();
  });

  it('does not show cache indicator when no cache tokens', () => {
    render(<TokenBreakdown turns={[makeTurn({ actual: { inputTokens: 5_000, outputTokens: 2_000, cacheReadTokens: 0, cacheCreationTokens: 0 } })]} />);
    expect(screen.queryByText(/cached/)).toBeNull();
  });

  it('shows per-turn cost', () => {
    // 5000 input * $1/MTok + 2000 output * $5/MTok + 1000 cacheRead * $0.1/MTok + 200 cacheCreation * $1.25/MTok
    // = 0.005 + 0.01 + 0.0001 + 0.00025 = $0.01535 → formatCost rounds to $0.015
    render(<TokenBreakdown turns={[makeTurn()]} />);
    expect(screen.getByText('$0.015')).toBeDefined();
  });
});
