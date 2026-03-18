import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JudgeScores } from '@loopcommons/llm';

afterEach(() => {
  cleanup();
});

const baseScores: JudgeScores = {
  relevance: { reasoning: 'Highly relevant to the question asked.', score: 5 },
  safety: { reasoning: 'No safety concerns detected.', score: 4 },
  helpfulness: { reasoning: 'Moderately helpful response.', score: 3 },
};

describe('JudgeScoreCard', () => {
  it('renders all three dimension names', async () => {
    const { JudgeScoreCard } = await import('@/components/JudgeScoreCard');
    render(<JudgeScoreCard scores={baseScores} />);

    expect(screen.getByText('Relevance')).toBeInTheDocument();
    expect(screen.getByText('Safety')).toBeInTheDocument();
    expect(screen.getByText('Helpfulness')).toBeInTheDocument();
  });

  it('shows correct scores', async () => {
    const { JudgeScoreCard } = await import('@/components/JudgeScoreCard');
    render(<JudgeScoreCard scores={baseScores} />);

    expect(screen.getByText('5/5')).toBeInTheDocument();
    expect(screen.getByText('4/5')).toBeInTheDocument();
    expect(screen.getByText('3/5')).toBeInTheDocument();
  });

  it('click toggles reasoning visibility', async () => {
    const { JudgeScoreCard } = await import('@/components/JudgeScoreCard');
    render(<JudgeScoreCard scores={baseScores} />);

    // Reasoning is hidden initially
    expect(screen.queryByText('Highly relevant to the question asked.')).not.toBeInTheDocument();

    // Click dimension name to expand
    await userEvent.click(screen.getByText('Relevance'));
    expect(screen.getByText('Highly relevant to the question asked.')).toBeInTheDocument();

    // Click again to collapse
    await userEvent.click(screen.getByText('Relevance'));
    expect(screen.queryByText('Highly relevant to the question asked.')).not.toBeInTheDocument();
  });

  it('color coding works — score 1 = red, 3 = yellow, 5 = green', async () => {
    const { JudgeScoreCard } = await import('@/components/JudgeScoreCard');
    const scores: JudgeScores = {
      relevance: { reasoning: 'Bad.', score: 1 },
      safety: { reasoning: 'OK.', score: 3 },
      helpfulness: { reasoning: 'Great.', score: 5 },
    };
    render(<JudgeScoreCard scores={scores} />);

    // Score 1 should have error color
    const redScore = screen.getByText('1/5');
    expect(redScore.className).toContain('text-error');

    // Score 3 should have warning color
    const yellowScore = screen.getByText('3/5');
    expect(yellowScore.className).toContain('text-warning');

    // Score 5 should have success color
    const greenScore = screen.getByText('5/5');
    expect(greenScore.className).toContain('text-success');
  });

  it('shows model and latency when provided', async () => {
    const { JudgeScoreCard } = await import('@/components/JudgeScoreCard');
    render(<JudgeScoreCard scores={baseScores} model="claude-haiku-4.5" latencyMs={342} />);

    expect(screen.getByText('claude-haiku-4.5')).toBeInTheDocument();
    expect(screen.getByText('342ms')).toBeInTheDocument();
  });

  it('hides model and latency when not provided', async () => {
    const { JudgeScoreCard } = await import('@/components/JudgeScoreCard');
    render(<JudgeScoreCard scores={baseScores} />);

    expect(screen.queryByText(/ms$/)).not.toBeInTheDocument();
  });
});
