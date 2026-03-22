import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

import { TournamentDetailView } from '@/components/arena/TournamentDetailView';

afterEach(() => cleanup());

const mockDetail = {
  id: 'abc12345-dead-beef',
  generations: [
    {
      generation: 0,
      populationSize: 4,
      agents: [
        { id: 'a1', tools: ['inspect', 'act'] },
        { id: 'a2', tools: ['search', 'model'] },
      ],
      fitness: [
        {
          agentId: 'a1',
          fitnessScore: 0.85,
          taskResults: [
            { encounterId: 'enc-1', resolved: true, score: 0.9, stepCount: 3, died: false, costEstimate: 0.01 },
            { encounterId: 'enc-2', resolved: false, score: 0.2, stepCount: 5, died: true, costEstimate: 0.02 },
          ],
        },
        {
          agentId: 'a2',
          fitnessScore: 0.6,
          taskResults: [
            { encounterId: 'enc-1', resolved: true, score: 0.7, stepCount: 4, died: false, costEstimate: 0.01 },
            { encounterId: 'enc-2', resolved: true, score: 0.5, stepCount: 6, died: false, costEstimate: 0.02 },
          ],
        },
      ],
    },
  ],
  complete: {
    bestFitness: 0.85,
    winnerId: 'a1',
    winnerTools: ['inspect', 'act'],
  },
};

describe('TournamentDetailView', () => {
  it('renders tournament ID header', () => {
    render(<TournamentDetailView detail={mockDetail} />);
    expect(screen.getByText(/abc12345/)).toBeInTheDocument();
  });

  it('renders generation and agent count', () => {
    render(<TournamentDetailView detail={mockDetail} />);
    expect(screen.getByText(/1 generation/i)).toBeInTheDocument();
    expect(screen.getByText(/4 agents/i)).toBeInTheDocument();
  });

  it('renders best fitness', () => {
    render(<TournamentDetailView detail={mockDetail} />);
    expect(screen.getByText(/0\.850/)).toBeInTheDocument();
  });

  it('renders winner tool badges', () => {
    render(<TournamentDetailView detail={mockDetail} />);
    // Winner badges render tool names; heatmap also shows abbreviated tool letters
    const inspectBadges = screen.getAllByText('inspect');
    expect(inspectBadges.length).toBeGreaterThanOrEqual(1);
    const actBadges = screen.getAllByText('act');
    expect(actBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('renders heatmap', () => {
    render(<TournamentDetailView detail={mockDetail} />);
    // Heatmap shows encounter IDs as column headers
    expect(screen.getByText('ENC-1')).toBeInTheDocument();
    expect(screen.getByText('ENC-2')).toBeInTheDocument();
  });

  it('renders featured death when a death exists', () => {
    render(<TournamentDetailView detail={mockDetail} />);
    expect(screen.getByText(/featured death/i)).toBeInTheDocument();
  });

  it('renders nothing problematic when no generations', () => {
    const empty = { ...mockDetail, generations: [], complete: null };
    render(<TournamentDetailView detail={empty} />);
    expect(screen.getByText(/abc12345/)).toBeInTheDocument();
  });
});
