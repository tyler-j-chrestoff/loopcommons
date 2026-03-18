import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { Round, Trace } from '@loopcommons/llm';

// ---------------------------------------------------------------------------
// Helpers: mock data factories
// ---------------------------------------------------------------------------

function makeRound(overrides: Partial<Round> = {}): Round {
  return {
    index: 0,
    startedAt: 1000,
    completedAt: 1200,
    latencyMs: 200,
    request: { messages: [], toolNames: [] },
    response: {
      content: 'hello',
      toolCalls: [],
      usage: { inputTokens: 100, outputTokens: 50 },
      cost: 0.001,
      finishReason: 'stop',
      rawResponse: null,
    },
    toolExecutions: [],
    ...overrides,
  };
}

function makeTrace(overrides: Partial<Trace> = {}): Trace {
  const rounds = overrides.rounds ?? [makeRound()];
  return {
    id: 'trace-1',
    startedAt: 1000,
    completedAt: 1200,
    model: 'claude-haiku-4.5',
    provider: 'anthropic',
    config: { maxRounds: 5 },
    rounds,
    totalUsage: { inputTokens: 100, outputTokens: 50 },
    totalCost: 0.001,
    status: 'completed',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TraceTimeline
// ---------------------------------------------------------------------------

describe('TraceTimeline', () => {
  it('renders without crashing with valid rounds', async () => {
    const { TraceTimeline } = await import('@/components/TraceTimeline');
    const round = makeRound({ startedAt: 1000, completedAt: 1500, latencyMs: 500 });
    const { container } = render(<TraceTimeline rounds={[round]} />);
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('returns null for empty rounds', async () => {
    const { TraceTimeline } = await import('@/components/TraceTimeline');
    const { container } = render(<TraceTimeline rounds={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders tool execution bars', async () => {
    const { TraceTimeline } = await import('@/components/TraceTimeline');
    const round = makeRound({
      startedAt: 1000,
      completedAt: 1500,
      latencyMs: 500,
      toolExecutions: [
        {
          toolCallId: 'tc-1',
          toolName: 'get_resume',
          input: {},
          output: '{}',
          startedAt: 1100,
          completedAt: 1300,
          latencyMs: 200,
        },
      ],
    });
    const { container } = render(<TraceTimeline rounds={[round]} />);
    // Round bar + tool execution bar = at least 2 positioned divs
    const positioned = container.querySelectorAll('[style]');
    expect(positioned.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// TraceInspector
// ---------------------------------------------------------------------------

describe('TraceInspector', () => {
  it('renders placeholder when no trace and no live rounds', async () => {
    const { TraceInspector } = await import('@/components/TraceInspector');
    render(<TraceInspector trace={null} liveRounds={[]} />);
    expect(screen.getByText('Send a message to see trace data')).toBeTruthy();
  });

  it('renders completed trace summary', async () => {
    const { TraceInspector } = await import('@/components/TraceInspector');
    const trace = makeTrace();
    render(<TraceInspector trace={trace} liveRounds={[]} />);
    expect(screen.getByText('Trace')).toBeTruthy();
    expect(screen.getByText('completed')).toBeTruthy();
  });

  it('shows running status with live rounds', async () => {
    const { TraceInspector } = await import('@/components/TraceInspector');
    render(<TraceInspector trace={null} liveRounds={[makeRound()]} />);
    expect(screen.getByText('running')).toBeTruthy();
  });

  it('displays model name when present in trace', async () => {
    const { TraceInspector } = await import('@/components/TraceInspector');
    const trace = makeTrace({ model: 'claude-haiku-4.5' });
    render(<TraceInspector trace={trace} liveRounds={[]} />);
    expect(screen.getAllByText('Model: claude-haiku-4.5').length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// CostDashboard
// ---------------------------------------------------------------------------

describe('CostDashboard', () => {
  it('renders with no messages', async () => {
    const { CostDashboard } = await import('@/components/CostDashboard');
    const { container } = render(<CostDashboard messages={[]} />);
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('displays aggregated token count and cost', async () => {
    const { CostDashboard } = await import('@/components/CostDashboard');
    const messages = [
      {
        id: '1',
        role: 'assistant' as const,
        content: 'hi',
        trace: makeTrace(),
        cost: 0.001,
      },
    ];
    render(<CostDashboard messages={messages} />);
    // Should show token count (150 = 100 input + 50 output)
    expect(screen.getByText(/150/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// SpendGauge
// ---------------------------------------------------------------------------

describe('SpendGauge', () => {
  it('returns null when spendStatus is null', async () => {
    const { SpendGauge } = await import('@/components/SpendGauge');
    const { container } = render(<SpendGauge spendStatus={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders spend bar and amounts', async () => {
    const { SpendGauge } = await import('@/components/SpendGauge');
    render(
      <SpendGauge
        spendStatus={{
          currentSpendUsd: 0.5,
          dailyCapUsd: 1.0,
          remainingUsd: 0.5,
          percentUsed: 50,
          resetAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
        }}
      />
    );
    // Should display current / cap
    expect(screen.getByText(/\$0\.50/)).toBeTruthy();
    expect(screen.getByText(/\$1\.00/)).toBeTruthy();
  });

  it('shows budget reached at 100%', async () => {
    const { SpendGauge } = await import('@/components/SpendGauge');
    render(
      <SpendGauge
        spendStatus={{
          currentSpendUsd: 1.0,
          dailyCapUsd: 1.0,
          remainingUsd: 0,
          percentUsed: 100,
          resetAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
        }}
      />
    );
    expect(screen.getByText('Budget reached')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// SecurityEventLog
// ---------------------------------------------------------------------------

describe('SecurityEventLog', () => {
  it('renders with empty events', async () => {
    const { SecurityEventLog } = await import('@/components/SecurityEventLog');
    render(<SecurityEventLog events={[]} />);
    expect(screen.getByText('Security Events')).toBeTruthy();
  });

  it('shows event count badge when events exist', async () => {
    const { SecurityEventLog } = await import('@/components/SecurityEventLog');
    const events = [
      { type: 'security:input-sanitized' as const, reason: 'Unicode normalization', timestamp: Date.now() },
      { type: 'security:input-rejected' as const, reason: 'Role spoofing', timestamp: Date.now() },
    ];
    render(<SecurityEventLog events={events} />);
    expect(screen.getByText('2')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// RateLimitIndicator
// ---------------------------------------------------------------------------

describe('RateLimitIndicator', () => {
  it('returns null when rateLimitStatus is null', async () => {
    const { RateLimitIndicator } = await import('@/components/RateLimitIndicator');
    const { container } = render(<RateLimitIndicator rateLimitStatus={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders remaining/limit counter', async () => {
    const { RateLimitIndicator } = await import('@/components/RateLimitIndicator');
    render(
      <RateLimitIndicator
        rateLimitStatus={{
          remaining: 3,
          limit: 5,
          activeConnections: 1,
          concurrencyLimit: 2,
          resetMs: 60000,
        }}
      />
    );
    expect(screen.getByText('3/5')).toBeTruthy();
    expect(screen.getByText('1/2 conn')).toBeTruthy();
  });

  it('hides connection indicator when no active connections', async () => {
    const { RateLimitIndicator } = await import('@/components/RateLimitIndicator');
    const { container } = render(
      <RateLimitIndicator
        rateLimitStatus={{
          remaining: 5,
          limit: 5,
          activeConnections: 0,
          concurrencyLimit: 2,
          resetMs: 60000,
        }}
      />
    );
    expect(container.textContent).toContain('5/5');
    expect(container.textContent).not.toContain('conn');
  });
});
