'use client';

import type { MessageFeedback } from '@/lib/types';

type FeedbackBadgeProps = {
  feedback: MessageFeedback;
};

const categoryLabels: Record<string, string> = {
  inaccurate: 'Inaccurate',
  not_relevant: 'Not relevant',
  incomplete: 'Incomplete',
  harmful: 'Harmful',
};

export function FeedbackBadge({ feedback }: FeedbackBadgeProps) {
  const isPositive = feedback.rating === 'positive';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
        isPositive
          ? 'bg-success/20 text-success'
          : 'bg-error/20 text-error'
      }`}
    >
      {isPositive ? '👍' : '👎'}
      {feedback.category && (
        <span className="ml-0.5">{categoryLabels[feedback.category] ?? feedback.category}</span>
      )}
    </span>
  );
}
