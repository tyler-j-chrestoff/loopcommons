'use client';

import { useState } from 'react';

type FeedbackButtonsProps = {
  messageId: string;
  sessionId: string;
  onSubmit: (payload: {
    messageId: string;
    sessionId: string;
    rating: 'positive' | 'negative';
    category?: string;
  }) => void;
};

const CATEGORIES = [
  { label: 'Inaccurate', value: 'inaccurate' },
  { label: 'Not relevant', value: 'not_relevant' },
  { label: 'Incomplete', value: 'incomplete' },
  { label: 'Harmful', value: 'harmful' },
] as const;

export function FeedbackButtons({ messageId, sessionId, onSubmit }: FeedbackButtonsProps) {
  const [submitted, setSubmitted] = useState<'positive' | 'negative' | null>(null);
  const [showCategories, setShowCategories] = useState(false);

  function handleThumbsUp() {
    if (submitted) return;
    setSubmitted('positive');
    onSubmit({ messageId, sessionId, rating: 'positive' });
  }

  function handleThumbsDown() {
    if (submitted) return;
    setShowCategories(true);
  }

  function handleCategory(category: string) {
    setSubmitted('negative');
    setShowCategories(false);
    onSubmit({ messageId, sessionId, rating: 'negative', category });
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-1">
      <div className="flex gap-1">
        <button
          type="button"
          aria-label="Thumbs up"
          disabled={submitted !== null}
          onClick={handleThumbsUp}
          className={`rounded p-1 text-sm transition-colors ${
            submitted === 'positive'
              ? 'text-success'
              : 'text-text-muted hover:text-text'
          } disabled:cursor-not-allowed`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M1 8.25a1.25 1.25 0 1 1 2.5 0v7.5a1.25 1.25 0 1 1-2.5 0v-7.5ZM5.5 6v9.25a.75.75 0 0 0 .478.698l5.404 2.078a2.75 2.75 0 0 0 2.24-.154l3.603-1.95A1.876 1.876 0 0 0 18 14.2V10.5a1.75 1.75 0 0 0-1.75-1.75h-3.5a.25.25 0 0 1-.25-.25V5.25a2.25 2.25 0 0 0-4.5 0v.75H5.5Z" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Thumbs down"
          disabled={submitted !== null}
          onClick={handleThumbsDown}
          className={`rounded p-1 text-sm transition-colors ${
            submitted === 'negative'
              ? 'text-error'
              : 'text-text-muted hover:text-text'
          } disabled:cursor-not-allowed`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M19 11.75a1.25 1.25 0 1 1-2.5 0v-7.5a1.25 1.25 0 1 1 2.5 0v7.5ZM14.5 14V4.75a.75.75 0 0 0-.478-.698L8.618 1.974a2.75 2.75 0 0 0-2.24.154L2.775 4.078A1.876 1.876 0 0 0 2 5.8V9.5c0 .966.784 1.75 1.75 1.75h3.5a.25.25 0 0 1 .25.25v3.25a2.25 2.25 0 0 0 4.5 0v-.75h2.5Z" />
          </svg>
        </button>
      </div>
      {showCategories && (
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => handleCategory(cat.value)}
              className="rounded bg-bg-elevated px-2 py-0.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
