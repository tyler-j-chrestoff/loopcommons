import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

import TournamentDetailPage from '@/app/arena/[id]/TournamentDetailClient';

afterEach(() => cleanup());

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockDetail = {
  id: 'abc12345-dead-beef',
  generations: [
    {
      generation: 0,
      populationSize: 4,
      agents: [
        { id: 'a1', tools: ['inspect', 'act'] },
        { id: 'a2', tools: ['search'] },
      ],
      fitness: [
        {
          agentId: 'a1',
          fitnessScore: 0.85,
          taskResults: [
            { encounterId: 'enc-1', resolved: true, score: 0.9, stepCount: 3, died: false, costEstimate: 0.01 },
          ],
        },
        {
          agentId: 'a2',
          fitnessScore: 0.6,
          taskResults: [
            { encounterId: 'enc-1', resolved: true, score: 0.6, stepCount: 4, died: false, costEstimate: 0.01 },
          ],
        },
      ],
    },
  ],
  complete: { bestFitness: 0.85, winnerId: 'a1', winnerTools: ['inspect', 'act'] },
};

describe('TournamentDetailClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches tournament detail and renders it', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockDetail,
    });

    render(<TournamentDetailPage tournamentId="abc12345-dead-beef" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/abc12345/).length).toBeGreaterThanOrEqual(1);
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/arena/tournaments/abc12345-dead-beef');
  });

  it('shows error when tournament not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Tournament not found' }),
    });

    render(<TournamentDetailPage tournamentId="nonexistent" />);

    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });
  });
});
