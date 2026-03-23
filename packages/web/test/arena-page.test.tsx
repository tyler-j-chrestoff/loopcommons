import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const mockReplace = vi.fn();
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: vi.fn() }),
}));

import ArenaPage from '@/app/arena/page';

afterEach(() => {
  cleanup();
});

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ArenaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('redirects to live route when active tournament detected', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/current')) {
        return { ok: true, json: async () => ({ active: true, tournamentId: 't-existing', status: 'running' }) };
      }
      if (url === '/api/arena/tournaments') {
        return { ok: true, json: async () => [] };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    render(<ArenaPage />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/arena/t-existing/live');
    });
  });

  it('loads latest tournament detail as hero', async () => {
    const mockDetail = {
      id: 'latest-123',
      generations: [{
        generation: 0,
        populationSize: 4,
        agents: [{ id: 'a1', tools: ['inspect'] }],
        fitness: [{
          agentId: 'a1',
          fitnessScore: 0.8,
          taskResults: [{ encounterId: 'e1', resolved: true, score: 0.8, stepCount: 3, died: false, costEstimate: 0.01 }],
        }],
      }],
      complete: { bestFitness: 0.8, winnerId: 'a1', winnerTools: ['inspect'] },
    };

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/current')) {
        return { ok: false, status: 404, json: async () => ({ active: false }) };
      }
      if (url === '/api/arena/tournaments') {
        return {
          ok: true,
          json: async () => [{
            id: 'latest-123', status: 'complete', generationCount: 1, agentCount: 4,
            bestFitness: 0.8, winnerId: 'a1', winnerTools: ['inspect'],
            startedAt: '2026-03-20T10:00:00Z', completedAt: '2026-03-20T10:05:00Z',
          }],
        };
      }
      if (url === '/api/arena/tournaments/latest-123') {
        return { ok: true, json: async () => mockDetail };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    render(<ArenaPage />);
    await waitFor(() => {
      expect(screen.getAllByText(/latest-1/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows past tournaments list when more than one', async () => {
    const mockDetail = {
      id: 'latest-123',
      generations: [{
        generation: 0, populationSize: 2,
        agents: [{ id: 'a1', tools: ['act'] }],
        fitness: [{ agentId: 'a1', fitnessScore: 0.5, taskResults: [] }],
      }],
      complete: { bestFitness: 0.5, winnerId: 'a1', winnerTools: ['act'] },
    };

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/current')) {
        return { ok: false, status: 404, json: async () => ({ active: false }) };
      }
      if (url === '/api/arena/tournaments') {
        return {
          ok: true,
          json: async () => [
            { id: 'latest-123', status: 'complete', generationCount: 1, agentCount: 2, bestFitness: 0.5, winnerId: 'a1', winnerTools: ['act'], startedAt: null, completedAt: null },
            { id: 'older-456', status: 'complete', generationCount: 3, agentCount: 4, bestFitness: 0.7, winnerId: 'a2', winnerTools: ['search'], startedAt: null, completedAt: null },
          ],
        };
      }
      if (url.includes('/api/arena/tournaments/latest-123')) {
        return { ok: true, json: async () => mockDetail };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    render(<ArenaPage />);
    await waitFor(() => {
      expect(screen.getByText(/older-45/)).toBeInTheDocument();
    });
  });
});
