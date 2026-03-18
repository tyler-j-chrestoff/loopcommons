import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FeedbackBadge } from '@/components/FeedbackBadge';

afterEach(() => {
  cleanup();
});

describe('FeedbackBadge', () => {
  it('renders thumbs up for positive feedback', () => {
    render(<FeedbackBadge feedback={{ rating: 'positive' }} />);
    expect(screen.getByText('👍')).toBeInTheDocument();
  });

  it('renders thumbs down for negative feedback', () => {
    render(<FeedbackBadge feedback={{ rating: 'negative' }} />);
    expect(screen.getByText('👎')).toBeInTheDocument();
  });

  it('shows category label for negative feedback with category', () => {
    render(<FeedbackBadge feedback={{ rating: 'negative', category: 'inaccurate' }} />);
    expect(screen.getByText('Inaccurate')).toBeInTheDocument();
  });

  it('shows not_relevant as "Not relevant"', () => {
    render(<FeedbackBadge feedback={{ rating: 'negative', category: 'not_relevant' }} />);
    expect(screen.getByText('Not relevant')).toBeInTheDocument();
  });

  it('does not show category for positive feedback', () => {
    render(<FeedbackBadge feedback={{ rating: 'positive' }} />);
    expect(screen.queryByText('Inaccurate')).not.toBeInTheDocument();
  });
});
