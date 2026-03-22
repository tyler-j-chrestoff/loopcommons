import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

afterEach(() => cleanup());

const mockFetch = vi.fn();
global.fetch = mockFetch;

class MockEventSource {
  onmessage: ((msg: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(public url: string) {}
}
(global as any).EventSource = MockEventSource;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const agent1 = { id: 'a1', tools: ['inspect', 'act'], origin: 'seed', parentIds: [], identity: 'h1' };
const agent2 = { id: 'a2', tools: ['search', 'model'], origin: 'seed', parentIds: [], identity: 'h2' };
const fitness1 = {
  agentId: 'a1',
  fitnessScore: 0.85,
  taskResults: [
    { encounterId: 'e1', resolved: true, score: 0.9, stepCount: 3, died: false, costEstimate: 0.001 },
    { encounterId: 'e2', resolved: false, score: 0.2, stepCount: 10, died: true, costEstimate: 0.005 },
  ],
  metrics: { completionRate: 0.5, meanScore: 0.55, meanSteps: 6.5, survivalRate: 0.5, totalCost: 0.006, meanCollateral: 0 },
};
const fitness2 = {
  agentId: 'a2',
  fitnessScore: 0.6,
  taskResults: [
    { encounterId: 'e1', resolved: false, score: 0.3, stepCount: 8, died: true, costEstimate: 0.004 },
    { encounterId: 'e2', resolved: true, score: 0.7, stepCount: 5, died: false, costEstimate: 0.003 },
  ],
  metrics: { completionRate: 0.5, meanScore: 0.5, meanSteps: 6.5, survivalRate: 0.5, totalCost: 0.007, meanCollateral: 0 },
};

const tournamentList = [
  {
    id: 'tid-1',
    status: 'complete',
    generationCount: 3,
    agentCount: 8,
    bestFitness: 0.85,
    winnerId: 'a1',
    winnerTools: ['inspect', 'act'],
    startedAt: '2026-01-15T10:00:00Z',
    completedAt: '2026-01-15T10:05:00Z',
  },
  {
    id: 'tid-2',
    status: 'complete',
    generationCount: 5,
    agentCount: 8,
    bestFitness: 0.72,
    winnerId: 'b1',
    winnerTools: ['search', 'act'],
    startedAt: '2026-01-14T10:00:00Z',
    completedAt: '2026-01-14T10:10:00Z',
  },
];

const tournamentDetail = {
  id: 'tid-1',
  generations: [{
    type: 'generation',
    generation: 0,
    populationSize: 2,
    agents: [agent1, agent2],
    fitness: [fitness1, fitness2],
    survivors: ['a1'],
    mutations: [],
    crossovers: [],
    durationMs: 100,
  }],
  complete: {
    type: 'tournament_complete',
    tournamentId: 'tid-1',
    generationsRun: 1,
    bestFitness: 0.85,
    winnerId: 'a1',
    winnerTools: ['inspect', 'act'],
    winnerOrigin: 'seed',
    startedAt: '2026-01-15T10:00:00Z',
    completedAt: '2026-01-15T10:05:00Z',
  },
};

// ---------------------------------------------------------------------------
// Heatmap component
// ---------------------------------------------------------------------------

import { EncounterHeatmap } from '@/components/EncounterHeatmap';

describe('EncounterHeatmap', () => {
  it('renders agents sorted by fitness descending', () => {
    render(<EncounterHeatmap agents={[agent1, agent2]} fitness={[fitness1, fitness2]} />);
    const rows = screen.getAllByRole('row');
    // header + 2 data rows
    expect(rows.length).toBe(3);
    // First data row should be agent1 (higher fitness)
    expect(rows[1].textContent).toContain('0.85');
  });

  it('renders encounter columns', () => {
    render(<EncounterHeatmap agents={[agent1]} fitness={[fitness1]} />);
    expect(screen.getByText('E1')).toBeInTheDocument();
    expect(screen.getByText('E2')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<EncounterHeatmap agents={[]} fitness={[]} />);
    expect(screen.getByText(/no encounters/i)).toBeInTheDocument();
  });

  it('renders tool badges for agents', () => {
    render(<EncounterHeatmap agents={[agent1]} fitness={[fitness1]} />);
    expect(screen.getByText('i')).toBeInTheDocument(); // inspect → i
    expect(screen.getByText('a')).toBeInTheDocument(); // act → a
  });
});

// ---------------------------------------------------------------------------
// Featured Death card
// ---------------------------------------------------------------------------

import { FeaturedDeath } from '@/components/FeaturedDeath';

describe('FeaturedDeath', () => {
  it('renders nothing when no deaths exist', () => {
    const noDeath = [{
      ...fitness1,
      taskResults: fitness1.taskResults.map(tr => ({ ...tr, died: false })),
    }];
    const { container } = render(
      <FeaturedDeath agents={[agent1]} fitness={noDeath} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders death card with agent tools and encounter info', () => {
    render(<FeaturedDeath agents={[agent1, agent2]} fitness={[fitness1, fitness2]} />);
    // Should show some death-related content
    expect(screen.getByText(/death/i)).toBeInTheDocument();
  });

  it('selects the most interesting death', () => {
    render(<FeaturedDeath agents={[agent1, agent2]} fitness={[fitness1, fitness2]} />);
    // agent2 dying in e1 with score 0.3, stepCount 8 → interestingness = 8 * (1 - 0.3) = 5.6
    // agent1 dying in e2 with score 0.2, stepCount 10 → interestingness = 10 * (1 - 0.2) = 8.0
    // agent1's death in e2 is more interesting — shown in epitaph
    const epitaph = screen.getByText(/fought hard/i);
    expect(epitaph.textContent).toContain('e2');
  });
});

// ---------------------------------------------------------------------------
// Arena page integration
// ---------------------------------------------------------------------------

import ArenaPage from '@/app/arena/page';

describe('ArenaPage (results-first)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows latest tournament heatmap when tournaments exist', async () => {
    // First call: check current tournament (no active)
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ active: false }) });
    // Second call: list tournaments
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => tournamentList });
    // Third call: tournament detail
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => tournamentDetail });

    render(<ArenaPage />);
    await waitFor(() => {
      // Should show heatmap encounter columns
      expect(screen.getByText('E1')).toBeInTheDocument();
    });
  });

  it('shows empty state when no tournaments exist', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ active: false }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    render(<ArenaPage />);
    await waitFor(() => {
      expect(screen.getByText(/no tournaments yet/i)).toBeInTheDocument();
    });
  });

  it('shows past tournaments list', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ active: false }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => tournamentList });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => tournamentDetail });

    render(<ArenaPage />);
    await waitFor(() => {
      expect(screen.getByText(/tid-2/i)).toBeInTheDocument();
    });
  });

  it('has navigation links', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ active: false }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    render(<ArenaPage />);
    await waitFor(() => {
      expect(screen.getByText('Chat')).toBeInTheDocument();
      expect(screen.getByText('Blog')).toBeInTheDocument();
      expect(screen.getByText('Arena')).toBeInTheDocument();
    });
  });
});
