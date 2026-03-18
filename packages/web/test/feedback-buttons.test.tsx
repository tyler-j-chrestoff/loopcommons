import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { FeedbackButtons } from '@/components/FeedbackButtons';

afterEach(() => {
  cleanup();
});

const defaultProps = {
  messageId: 'msg-1',
  sessionId: 'sess-1',
  onSubmit: vi.fn(),
};

describe('FeedbackButtons', () => {
  it('renders thumbs up and thumbs down buttons', () => {
    render(<FeedbackButtons {...defaultProps} />);
    expect(screen.getByRole('button', { name: /thumbs up/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /thumbs down/i })).toBeInTheDocument();
  });

  it('calls onSubmit with positive rating when thumbs up is clicked', async () => {
    const onSubmit = vi.fn();
    render(<FeedbackButtons {...defaultProps} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /thumbs up/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      messageId: 'msg-1',
      sessionId: 'sess-1',
      rating: 'positive',
    });
  });

  it('does not show category picker initially', () => {
    render(<FeedbackButtons {...defaultProps} />);
    expect(screen.queryByText('Inaccurate')).not.toBeInTheDocument();
    expect(screen.queryByText('Not relevant')).not.toBeInTheDocument();
  });

  it('shows category picker when thumbs down is clicked', async () => {
    render(<FeedbackButtons {...defaultProps} />);

    await userEvent.click(screen.getByRole('button', { name: /thumbs down/i }));

    expect(screen.getByText('Inaccurate')).toBeInTheDocument();
    expect(screen.getByText('Not relevant')).toBeInTheDocument();
    expect(screen.getByText('Incomplete')).toBeInTheDocument();
    expect(screen.getByText('Harmful')).toBeInTheDocument();
  });

  it('calls onSubmit with negative rating and category when a category is selected', async () => {
    const onSubmit = vi.fn();
    render(<FeedbackButtons {...defaultProps} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /thumbs down/i }));
    await userEvent.click(screen.getByText('Inaccurate'));

    expect(onSubmit).toHaveBeenCalledWith({
      messageId: 'msg-1',
      sessionId: 'sess-1',
      rating: 'negative',
      category: 'inaccurate',
    });
  });

  it('highlights thumbs up after positive submission', async () => {
    render(<FeedbackButtons {...defaultProps} />);

    await userEvent.click(screen.getByRole('button', { name: /thumbs up/i }));

    const btn = screen.getByRole('button', { name: /thumbs up/i });
    expect(btn.className).toContain('text-green');
  });

  it('highlights thumbs down after negative submission', async () => {
    const onSubmit = vi.fn();
    render(<FeedbackButtons {...defaultProps} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /thumbs down/i }));
    await userEvent.click(screen.getByText('Harmful'));

    const btn = screen.getByRole('button', { name: /thumbs down/i });
    expect(btn.className).toContain('text-red');
  });

  it('disables both buttons after submission', async () => {
    render(<FeedbackButtons {...defaultProps} />);

    await userEvent.click(screen.getByRole('button', { name: /thumbs up/i }));

    expect(screen.getByRole('button', { name: /thumbs up/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /thumbs down/i })).toBeDisabled();
  });

  it('disables buttons after negative category submission', async () => {
    render(<FeedbackButtons {...defaultProps} />);

    await userEvent.click(screen.getByRole('button', { name: /thumbs down/i }));
    await userEvent.click(screen.getByText('Incomplete'));

    expect(screen.getByRole('button', { name: /thumbs up/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /thumbs down/i })).toBeDisabled();
  });

  it('hides category picker after submission', async () => {
    render(<FeedbackButtons {...defaultProps} />);

    await userEvent.click(screen.getByRole('button', { name: /thumbs down/i }));
    await userEvent.click(screen.getByText('Not relevant'));

    expect(screen.queryByText('Inaccurate')).not.toBeInTheDocument();
  });

  it('does not call onSubmit again when clicking after already submitted', async () => {
    const onSubmit = vi.fn();
    render(<FeedbackButtons {...defaultProps} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /thumbs up/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // Clicking again should not fire
    await userEvent.click(screen.getByRole('button', { name: /thumbs up/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
