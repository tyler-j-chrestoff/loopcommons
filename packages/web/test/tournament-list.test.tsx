import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { TournamentList } from '@/components/arena/TournamentList';

afterEach(() => cleanup());

const mockTournaments = [
  {
    id: 'aaa11111-0000-0000',
    status: 'complete',
    generationCount: 5,
    agentCount: 8,
    bestFitness: 0.92,
    winnerId: 'w1',
    winnerTools: ['inspect', 'act'],
    startedAt: '2026-03-20T10:00:00Z',
    completedAt: '2026-03-20T10:05:00Z',
  },
  {
    id: 'bbb22222-0000-0000',
    status: 'interrupted',
    generationCount: 3,
    agentCount: 6,
    bestFitness: 0.71,
    winnerId: null,
    winnerTools: null,
    startedAt: '2026-03-19T10:00:00Z',
    completedAt: null,
  },
];

describe('TournamentList', () => {
  it('renders tournament cards with IDs', () => {
    render(<TournamentList tournaments={mockTournaments} />);
    expect(screen.getByText(/aaa11111/)).toBeInTheDocument();
    expect(screen.getByText(/bbb22222/)).toBeInTheDocument();
  });

  it('renders generation count and fitness', () => {
    render(<TournamentList tournaments={mockTournaments} />);
    expect(screen.getByText(/5g/)).toBeInTheDocument();
    expect(screen.getByText(/0\.92/)).toBeInTheDocument();
  });

  it('renders winner tool badges', () => {
    render(<TournamentList tournaments={mockTournaments} />);
    expect(screen.getByText('inspect')).toBeInTheDocument();
    expect(screen.getByText('act')).toBeInTheDocument();
  });

  it('shows interrupted status', () => {
    render(<TournamentList tournaments={mockTournaments} />);
    expect(screen.getByText('interrupted')).toBeInTheDocument();
  });

  it('renders links to tournament detail pages', () => {
    render(<TournamentList tournaments={mockTournaments} />);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/arena/aaa11111-0000-0000');
    expect(links[1]).toHaveAttribute('href', '/arena/bbb22222-0000-0000');
  });

  it('renders empty state', () => {
    render(<TournamentList tournaments={[]} />);
    expect(screen.getByText(/no tournaments/i)).toBeInTheDocument();
  });

  it('accepts compact prop for reduced layout', () => {
    render(<TournamentList tournaments={mockTournaments} compact />);
    // Should still render but in compact mode
    expect(screen.getByText(/aaa11111/)).toBeInTheDocument();
  });
});
