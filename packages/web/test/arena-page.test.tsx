import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

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
    // Default: no active tournament, no past tournaments
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/current')) {
        return { ok: false, status: 404, json: async () => ({ active: false }) };
      }
      if (url === '/api/arena/tournaments') {
        return { ok: true, json: async () => [] };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
  });

  it('shows empty state with start buttons when no tournaments', async () => {
    render(<ArenaPage />);
    await waitFor(() => {
      expect(screen.getByText(/no tournaments yet/i)).toBeInTheDocument();
      expect(screen.getByText('Run Tournament')).toBeInTheDocument();
      expect(screen.getByText('Mock Tournament')).toBeInTheDocument();
    });
  });

  it('reconnects to existing tournament on load', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/current')) {
        return { ok: true, json: async () => ({ active: true, tournamentId: 't-existing', status: 'running' }) };
      }
      if (url === '/api/arena/tournaments') {
        return { ok: true, json: async () => [] };
      }
      // TournamentLive state fetch
      return {
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
      };
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
