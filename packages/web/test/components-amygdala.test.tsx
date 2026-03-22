import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AmygdalaClassification, RoutingDecision } from '@/lib/types';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockAmygdala: AmygdalaClassification = {
  intent: 'conversation',
  confidence: 0.92,
  threatScore: 0.05,
  threatCategory: 'none',
  threatReasoning: 'Friendly greeting with no manipulative intent.',
  rewriteModified: false,
  originalPrompt: 'Hello there!',
  rewrittenPrompt: 'Hello there!',
  latencyMs: 142,
};

const mockRouting: RoutingDecision = {
  subagentId: 'conversational',
  subagentName: 'Conversational',
  threatOverride: false,
  allowedTools: ['get_resume', 'get_project'],
  promptSource: 'derived',
  reasoning: 'Friendly greeting routed to conversational subagent.',
  totalMessages: 10,
  delegatedMessages: 8,
  deliveredMessages: 6,
  usedSummary: false,
};

// ---------------------------------------------------------------------------
// AmygdalaInspector
// ---------------------------------------------------------------------------

describe('AmygdalaInspector', () => {
  afterEach(() => cleanup());

  it('renders empty state when no data is provided', async () => {
    const { AmygdalaInspector } = await import('@/components/AmygdalaInspector');
    render(<AmygdalaInspector amygdala={null} routing={null} sessionId={null} />);
    expect(screen.getByText('Send a message to see the amygdala pipeline')).toBeInTheDocument();
  });

  it('renders with amygdala and routing data', async () => {
    const { AmygdalaInspector } = await import('@/components/AmygdalaInspector');
    render(
      <AmygdalaInspector
        amygdala={mockAmygdala}
        routing={mockRouting}
        sessionId="test-session-123"
      />,
    );
    expect(screen.getByText('test-session-123')).toBeInTheDocument();
    expect(screen.getByText('Input')).toBeInTheDocument();
    // "Amygdala" appears in both PipelineTimeline stage and the PassCard label
    expect(screen.getAllByText('Amygdala').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Router')).toBeInTheDocument();
  });

  it('renders with only amygdala data (no routing)', async () => {
    const { AmygdalaInspector } = await import('@/components/AmygdalaInspector');
    const { container } = render(
      <AmygdalaInspector amygdala={mockAmygdala} routing={null} sessionId={null} />,
    );
    expect(container.querySelector('button')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AmygdalaPassCard
// ---------------------------------------------------------------------------

describe('AmygdalaPassCard', () => {
  afterEach(() => cleanup());

  it('renders with required props', async () => {
    const { AmygdalaPassCard } = await import('@/components/AmygdalaPassCard');
    render(<AmygdalaPassCard pass={mockAmygdala} />);
    // intent appears in both header badge and detail section
    expect(screen.getAllByText('conversation').length).toBeGreaterThanOrEqual(1);
    // threat score appears in header and detail
    expect(screen.getAllByText('0.05').length).toBeGreaterThanOrEqual(1);
    // "Unchanged" appears in header badge and collapsible section label
    expect(screen.getAllByText('Unchanged').length).toBeGreaterThanOrEqual(1);
  });

  it('renders with label and collapsed state', async () => {
    const { AmygdalaPassCard } = await import('@/components/AmygdalaPassCard');
    render(<AmygdalaPassCard pass={mockAmygdala} label="Pass 1" defaultCollapsed />);
    expect(screen.getByText('Pass 1')).toBeInTheDocument();
  });

  it('shows Rewritten badge for modified rewrites', async () => {
    const { AmygdalaPassCard } = await import('@/components/AmygdalaPassCard');
    const modified: AmygdalaClassification = {
      ...mockAmygdala,
      rewriteModified: true,
      rewrittenPrompt: 'Sanitized prompt',
      threatScore: 0.45,
    };
    render(<AmygdalaPassCard pass={modified} />);
    const rewrittenElements = screen.getAllByText('Rewritten');
    expect(rewrittenElements.length).toBeGreaterThan(0);
  });

  it('shows high threat in red', async () => {
    const { AmygdalaPassCard } = await import('@/components/AmygdalaPassCard');
    const highThreat: AmygdalaClassification = {
      ...mockAmygdala,
      threatScore: 0.85,
      threatCategory: 'instruction-override',
      intent: 'adversarial',
    };
    render(<AmygdalaPassCard pass={highThreat} />);
    expect(screen.getAllByText('0.85').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('adversarial').length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// PipelineTimeline
// ---------------------------------------------------------------------------

describe('PipelineTimeline', () => {
  afterEach(() => cleanup());

  it('renders all four stages', async () => {
    const { PipelineTimeline } = await import('@/components/PipelineTimeline');
    render(<PipelineTimeline amygdala={mockAmygdala} routing={mockRouting} />);
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Amygdala')).toBeInTheDocument();
    expect(screen.getByText('Router')).toBeInTheDocument();
    expect(screen.getByText('Conversational')).toBeInTheDocument();
  });

  it('renders with null amygdala and routing', async () => {
    const { PipelineTimeline } = await import('@/components/PipelineTimeline');
    render(<PipelineTimeline amygdala={null} routing={null} />);
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Subagent')).toBeInTheDocument();
  });

  it('shows latency subtitle on amygdala stage', async () => {
    const { PipelineTimeline } = await import('@/components/PipelineTimeline');
    render(<PipelineTimeline amygdala={mockAmygdala} routing={mockRouting} />);
    expect(screen.getByText('142ms')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// RoutingCard
// ---------------------------------------------------------------------------

describe('RoutingCard', () => {
  afterEach(() => cleanup());

  it('renders subagent name and tools', async () => {
    const { RoutingCard } = await import('@/components/RoutingCard');
    render(<RoutingCard routing={mockRouting} />);
    expect(screen.getByText('Conversational')).toBeInTheDocument();
    expect(screen.getByText('get_resume')).toBeInTheDocument();
    expect(screen.getByText('get_project')).toBeInTheDocument();
  });

  it('renders context filtering stats', async () => {
    const { RoutingCard } = await import('@/components/RoutingCard');
    render(<RoutingCard routing={mockRouting} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Delegated')).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
  });

  it('shows filtered message count when messages are withheld', async () => {
    const { RoutingCard } = await import('@/components/RoutingCard');
    render(<RoutingCard routing={mockRouting} />);
    // delegated (8) - delivered (6) = 2 withheld
    expect(screen.getByText(/withheld by context filter/)).toBeInTheDocument();
  });

  it('shows threat override badge when active', async () => {
    const { RoutingCard } = await import('@/components/RoutingCard');
    const overrideRouting: RoutingDecision = { ...mockRouting, threatOverride: true };
    render(<RoutingCard routing={overrideRouting} />);
    expect(screen.getByText('Threat Override')).toBeInTheDocument();
  });

  it('shows "No tools" when allowedTools is empty', async () => {
    const { RoutingCard } = await import('@/components/RoutingCard');
    const noToolsRouting: RoutingDecision = { ...mockRouting, allowedTools: [] };
    render(<RoutingCard routing={noToolsRouting} />);
    expect(screen.getByText('No tools')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ComparisonMode
// ---------------------------------------------------------------------------

describe('ComparisonMode', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  it('renders loading state initially', async () => {
    // Fetch that never resolves to keep component in loading state
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;

    const { ComparisonMode } = await import('@/components/ComparisonMode');
    render(<ComparisonMode />);
    expect(screen.getByText('Pipeline Metrics')).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders error state on fetch failure', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500 } as Response),
    ) as unknown as typeof fetch;

    const { ComparisonMode } = await import('@/components/ComparisonMode');
    render(<ComparisonMode />);

    const errorMsg = await screen.findByText(/Metrics API returned 500/);
    expect(errorMsg).toBeInTheDocument();
  });

  it('renders metrics when fetch succeeds', async () => {
    const metricsData = {
      accuracy: {
        true_positives: 5,
        false_positives: 1,
        false_negatives: 0,
        true_negatives: 20,
        total: 26,
        precision: 0.833,
        recall: 1.0,
        f1_score: 0.909,
        false_positive_rate: 0.048,
        avg_threat_score: 0.25,
        avg_threat_score_attacks: 0.82,
        avg_threat_score_benign: 0.08,
      },
      regime: {
        total_sessions: 26,
        attack_sessions: 5,
        benign_sessions: 21,
        refused_sessions: 5,
        attack_rate: 0.192,
        regime: 'dormant',
        mean_threat_score: 0.25,
        median_threat_score: 0.1,
        intent_conversation: 15,
        intent_resume: 5,
        intent_project: 3,
        intent_adversarial: 2,
        intent_security: 1,
        intent_meta: 0,
      },
    };

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(metricsData),
      } as Response),
    ) as unknown as typeof fetch;

    const { ComparisonMode } = await import('@/components/ComparisonMode');
    render(<ComparisonMode />);

    const heading = await screen.findByText('Confusion Matrix');
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('Detection Performance')).toBeInTheDocument();
    expect(screen.getByText('dormant')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SessionThread
// ---------------------------------------------------------------------------

describe('SessionThread', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  it('renders nothing when sessionId is null', async () => {
    const { SessionThread } = await import('@/components/SessionThread');
    const { container } = render(<SessionThread sessionId={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when thread has only one session', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            thread: [
              { id: 'abc-123', date: '2026-03-18', messageCount: 5, eventCount: 20, durationMs: 30000 },
            ],
          }),
      } as Response),
    ) as unknown as typeof fetch;

    const { SessionThread } = await import('@/components/SessionThread');
    const { container } = render(<SessionThread sessionId="abc-123" />);

    // Wait for fetch to complete
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    // Single-session thread renders null
    expect(container.innerHTML).toBe('');
  });

  it('renders thread toggle when multiple sessions exist', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            thread: [
              { id: 'abc-123', date: '2026-03-18', messageCount: 5, eventCount: 20, durationMs: 30000 },
              { id: 'def-456', date: '2026-03-17', messageCount: 3, eventCount: 12, durationMs: 15000 },
            ],
          }),
      } as Response),
    ) as unknown as typeof fetch;

    const { SessionThread } = await import('@/components/SessionThread');
    render(<SessionThread sessionId="abc-123" />);

    const toggle = await screen.findByText(/Thread \(2\)/);
    expect(toggle).toBeInTheDocument();
  });
});
