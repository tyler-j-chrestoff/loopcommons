import { render, screen, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, afterEach } from 'vitest';
import type { BudgetSnapshot } from '@/lib/token-budget';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Partial<BudgetSnapshot> = {}): BudgetSnapshot {
  return {
    cumulative: {
      inputTokens: 10_000,
      outputTokens: 5_000,
      cacheReadTokens: 2_000,
      cacheCreationTokens: 500,
      totalTokens: 15_000,
    },
    budgetPercent: 5,
    costEstimate: 0.0035,
    modelContextLimit: 200_000,
    turns: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ContextBudgetBar tests
// ---------------------------------------------------------------------------

import { ContextBudgetBar } from '@/components/ContextBudgetBar';

describe('ContextBudgetBar', () => {
  afterEach(() => cleanup());

  it('renders nothing when snapshot is null', () => {
    const { container } = render(<ContextBudgetBar snapshot={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders percentage label', () => {
    render(<ContextBudgetBar snapshot={makeSnapshot({ budgetPercent: 42.5 })} />);
    expect(screen.getByText('42.5%')).toBeDefined();
  });

  it('renders token count as "Xk / 200k"', () => {
    render(<ContextBudgetBar snapshot={makeSnapshot({ budgetPercent: 5 })} />);
    expect(screen.getByText('10.0k / 200.0k')).toBeDefined();
  });

  it('renders cost estimate', () => {
    render(<ContextBudgetBar snapshot={makeSnapshot({ costEstimate: 0.0035 })} />);
    expect(screen.getByText('$0.0035')).toBeDefined();
  });

  it('uses green color for low usage (< 75%)', () => {
    const { container } = render(<ContextBudgetBar snapshot={makeSnapshot({ budgetPercent: 30 })} />);
    const bar = container.querySelector('[data-testid="budget-fill"]');
    expect(bar?.className).toContain('bg-success');
  });

  it('uses yellow color at 75% threshold', () => {
    const { container } = render(<ContextBudgetBar snapshot={makeSnapshot({ budgetPercent: 75 })} />);
    const bar = container.querySelector('[data-testid="budget-fill"]');
    expect(bar?.className).toContain('bg-warning');
  });

  it('uses orange color at 90% threshold', () => {
    const { container } = render(<ContextBudgetBar snapshot={makeSnapshot({ budgetPercent: 90 })} />);
    const bar = container.querySelector('[data-testid="budget-fill"]');
    expect(bar?.className).toContain('bg-orange-500');
  });

  it('uses red color at 100%', () => {
    const { container } = render(<ContextBudgetBar snapshot={makeSnapshot({ budgetPercent: 100 })} />);
    const bar = container.querySelector('[data-testid="budget-fill"]');
    expect(bar?.className).toContain('bg-error');
  });

  it('has pulse animation at 90%+', () => {
    const { container } = render(<ContextBudgetBar snapshot={makeSnapshot({ budgetPercent: 92 })} />);
    const bar = container.querySelector('[data-testid="budget-fill"]');
    expect(bar?.className).toContain('animate-pulse');
  });

  it('does not pulse below 90%', () => {
    const { container } = render(<ContextBudgetBar snapshot={makeSnapshot({ budgetPercent: 80 })} />);
    const bar = container.querySelector('[data-testid="budget-fill"]');
    expect(bar?.className).not.toContain('animate-pulse');
  });

  it('clamps bar width to 100%', () => {
    const { container } = render(<ContextBudgetBar snapshot={makeSnapshot({ budgetPercent: 105 })} />);
    const bar = container.querySelector('[data-testid="budget-fill"]') as HTMLElement;
    expect(bar?.style.width).toBe('100%');
  });

  it('renders shimmer effect when isStreaming is true', () => {
    const { container } = render(<ContextBudgetBar snapshot={makeSnapshot()} isStreaming={true} />);
    const shimmer = container.querySelector('[data-testid="budget-shimmer"]');
    expect(shimmer).not.toBeNull();
  });

  it('does not render shimmer when not streaming', () => {
    const { container } = render(<ContextBudgetBar snapshot={makeSnapshot()} isStreaming={false} />);
    const shimmer = container.querySelector('[data-testid="budget-shimmer"]');
    expect(shimmer).toBeNull();
  });

  it('renders with zero budget percent (first event)', () => {
    render(<ContextBudgetBar snapshot={makeSnapshot({ budgetPercent: 0 })} />);
    expect(screen.getByText('0%')).toBeDefined();
  });

  it('has a cost tooltip explaining pricing', () => {
    const { container } = render(<ContextBudgetBar snapshot={makeSnapshot()} />);
    const costEl = container.querySelector('[data-testid="budget-cost"]');
    expect(costEl?.getAttribute('title')).toContain('input');
    expect(costEl?.getAttribute('title')).toContain('output');
    expect(costEl?.getAttribute('title')).toContain('cache');
  });

  it('shows per-turn breakdown when clicked', async () => {
    const snapshot = makeSnapshot({
      turns: [{
        turnIndex: 0,
        source: 'subagent',
        actual: { inputTokens: 5000, outputTokens: 2000, cacheReadTokens: 0, cacheCreationTokens: 0 },
      }],
    });
    render(<ContextBudgetBar snapshot={snapshot} />);
    // Breakdown not visible initially
    expect(screen.queryByText('subagent')).toBeNull();
    // Click to expand
    const button = screen.getByRole('button', { name: /expand/i });
    await userEvent.click(button);
    expect(screen.getByText('subagent')).toBeDefined();
  });

  it('hides breakdown when clicked again', async () => {
    const snapshot = makeSnapshot({
      turns: [{
        turnIndex: 0,
        source: 'amygdala',
        actual: { inputTokens: 3000, outputTokens: 1000, cacheReadTokens: 0, cacheCreationTokens: 0 },
      }],
    });
    render(<ContextBudgetBar snapshot={snapshot} />);
    const button = screen.getByRole('button', { name: /expand/i });
    await userEvent.click(button);
    expect(screen.getByText('amygdala')).toBeDefined();
    // Click again to collapse
    await userEvent.click(screen.getByRole('button', { name: /collapse/i }));
    expect(screen.queryByText('amygdala')).toBeNull();
  });
});
