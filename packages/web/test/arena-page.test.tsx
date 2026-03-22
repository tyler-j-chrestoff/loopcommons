import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import ArenaPage from '@/app/arena/page';

afterEach(() => {
  cleanup();
});

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock EventSource
class MockEventSource {
  onmessage: ((msg: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(public url: string) {}
}
(global as any).EventSource = MockEventSource;

describe('ArenaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no active tournament
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({ active: false }) });
  });

  it('renders arena heading after loading', async () => {
    render(<ArenaPage />);
    await waitFor(() => {
      expect(screen.getByText('Arena Tournament')).toBeInTheDocument();
    });
  });

  it('shows start and mock buttons', async () => {
    render(<ArenaPage />);
    await waitFor(() => {
      expect(screen.getByText('Live Tournament')).toBeInTheDocument();
      expect(screen.getByText('Mock Tournament')).toBeInTheDocument();
    });
  });

  it('reconnects to existing tournament on load', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ active: true, tournamentId: 't-existing', status: 'running' }),
    });
    // Subsequent fetches for TournamentLive component
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tournamentId: 't-existing',
        status: 'running',
        generation: 0,
        population: [],
        fitness: [],
        bestFitness: 0,
        bestAgent: null,
        startedAt: '2026-01-01',
        error: null,
      }),
    });

    render(<ArenaPage />);
    await waitFor(() => {
      expect(screen.getByText(/Tournament t-existi/)).toBeInTheDocument();
    });
  });

  it('has navigation links', async () => {
    render(<ArenaPage />);
    await waitFor(() => {
      expect(screen.getByText('Chat')).toBeInTheDocument();
      expect(screen.getByText('Blog')).toBeInTheDocument();
      expect(screen.getByText('Arena')).toBeInTheDocument();
    });
  });
});
