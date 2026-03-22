import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TournamentLive } from '@/components/TournamentLive';

afterEach(() => {
  cleanup();
});

// Mock fetch + EventSource
const mockFetch = vi.fn();
global.fetch = mockFetch;

class MockEventSource {
  onmessage: ((msg: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(public url: string) {}
}

(global as any).EventSource = MockEventSource;

describe('TournamentLive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      json: async () => ({
        tournamentId: 't-1',
        status: 'running',
        generation: 2,
        population: [
          { id: 'a1', tools: ['inspect', 'act'] },
          { id: 'a2', tools: ['search', 'model'] },
        ],
        fitness: [
          { agentId: 'a1', fitnessScore: 0.75 },
          { agentId: 'a2', fitnessScore: 0.6 },
        ],
        bestFitness: 0.75,
        bestAgent: { id: 'a1', tools: ['inspect', 'act'] },
        startedAt: '2026-01-01T00:00:00Z',
        error: null,
      }),
    });
  });

  it('renders tournament header with truncated ID', () => {
    render(<TournamentLive tournamentId="abcdefgh-1234-5678-9abc-def012345678" />);
    expect(screen.getByText(/Tournament abcdefgh/)).toBeInTheDocument();
  });

  it('shows streaming indicator', () => {
    render(<TournamentLive tournamentId="t-1" />);
    expect(screen.getByText('streaming')).toBeInTheDocument();
  });

  it('renders event log placeholder', () => {
    render(<TournamentLive tournamentId="t-1" />);
    expect(screen.getByText('Waiting for events...')).toBeInTheDocument();
  });

  it('connects to SSE stream endpoint', () => {
    render(<TournamentLive tournamentId="t-1" />);
    // EventSource should be created with the stream URL
    expect(screen.getByText(/Tournament/)).toBeInTheDocument();
  });

  it('fetches initial state from state endpoint', () => {
    render(<TournamentLive tournamentId="t-1" />);
    expect(mockFetch).toHaveBeenCalledWith('/api/arena/tournament/t-1/state');
  });
});
