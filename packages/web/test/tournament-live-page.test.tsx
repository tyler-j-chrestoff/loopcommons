import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, back: vi.fn() }),
}));

import TournamentLiveClient from '@/app/arena/[id]/live/TournamentLiveClient';

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

describe('TournamentLiveClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tournamentId: 't-1',
        status: 'running',
        generation: 1,
        population: [{ id: 'a1', tools: ['inspect'] }],
        fitness: [{ agentId: 'a1', fitnessScore: 0.5 }],
        bestFitness: 0.5,
        bestAgent: { id: 'a1', tools: ['inspect'] },
        startedAt: '2026-03-20T10:00:00Z',
        error: null,
      }),
    });
  });

  it('renders TournamentLive with the tournament ID', async () => {
    render(<TournamentLiveClient tournamentId="t-1" />);
    await waitFor(() => {
      expect(screen.getAllByText(/t-1/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows breadcrumb with link to tournament detail', () => {
    render(<TournamentLiveClient tournamentId="t-1" />);
    const breadcrumbLink = screen.getByRole('link', { name: /t-1/ });
    expect(breadcrumbLink).toBeInTheDocument();
    expect(breadcrumbLink).toHaveAttribute('href', '/arena/t-1');
  });
});
