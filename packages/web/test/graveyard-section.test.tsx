import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GraveyardSection } from '@/components/GraveyardSection';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('GraveyardSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when API returns empty entries', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: [], total: 0 }),
    });

    const { container } = render(<GraveyardSection />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/arena/graveyard?limit=20');
    });
    expect(container.querySelector('[data-graveyard]')).toBeNull();
  });

  it('renders death cards when entries exist', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        entries: [
          {
            agentId: 'a1',
            tournamentId: 'tid-1',
            tools: ['inspect'],
            encounterId: 'e1',
            score: 0.1,
            stepCount: 5,
            deathCause: 'iteration_limit',
            collateral: 0,
            interestingness: 4.5,
            epitaph: '[inspect] ran out of time in e1',
          },
        ],
        total: 1,
      }),
    });

    render(<GraveyardSection />);
    await waitFor(() => {
      expect(screen.getByText('[inspect] ran out of time in e1')).toBeTruthy();
    });
  });

  it('renders featured card for first entry', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        entries: [
          {
            agentId: 'a1',
            tournamentId: 'tid-1',
            tools: ['inspect'],
            encounterId: 'e1',
            score: 0.1,
            stepCount: 5,
            deathCause: 'iteration_limit',
            collateral: 0,
            interestingness: 4.5,
            epitaph: '[inspect] ran out of time',
          },
          {
            agentId: 'b1',
            tournamentId: 'tid-1',
            tools: ['act'],
            encounterId: 'e2',
            score: 0.2,
            stepCount: 3,
            deathCause: 'surrender',
            collateral: 0,
            interestingness: 2.4,
            epitaph: '[act] gave up in e2',
          },
        ],
        total: 2,
      }),
    });

    const { container } = render(<GraveyardSection />);
    await waitFor(() => {
      expect(container.querySelector('[data-featured]')).toBeTruthy();
    });
  });

  it('handles fetch errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const { container } = render(<GraveyardSection />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    expect(container.querySelector('[data-graveyard]')).toBeNull();
  });
});
