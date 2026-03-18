'use client';

import { useState } from 'react';
import type { JudgeScores } from '@loopcommons/llm';

type JudgeScoreCardProps = {
  scores: JudgeScores;
  model?: string;
  latencyMs?: number;
};

type Dimension = 'relevance' | 'safety' | 'helpfulness';

const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'safety', label: 'Safety' },
  { key: 'helpfulness', label: 'Helpfulness' },
];

function scoreColor(score: number): string {
  if (score <= 2) return 'text-error';
  if (score <= 3) return 'text-warning';
  return 'text-success';
}

function barBgColor(score: number): string {
  if (score <= 2) return 'bg-error';
  if (score <= 3) return 'bg-warning';
  return 'bg-success';
}

export function JudgeScoreCard({ scores, model, latencyMs }: JudgeScoreCardProps) {
  const [expanded, setExpanded] = useState<Set<Dimension>>(new Set());

  function toggle(dim: Dimension) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(dim)) {
        next.delete(dim);
      } else {
        next.add(dim);
      }
      return next;
    });
  }

  return (
    <div className="rounded-lg bg-bg-surface border border-border p-3 text-xs space-y-2">
      <div className="flex items-center justify-between text-text-muted">
        <span className="font-medium text-text-secondary">Judge Scores</span>
        <div className="flex items-center gap-2">
          {model && <span>{model}</span>}
          {latencyMs != null && <span>{latencyMs}ms</span>}
        </div>
      </div>

      {DIMENSIONS.map(({ key, label }) => {
        const { score, reasoning } = scores[key];
        const fillPct = (score / 5) * 100;
        const isExpanded = expanded.has(key);

        return (
          <div key={key}>
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
              onClick={() => toggle(key)}
            >
              <span className="text-text">{label}</span>
              <span className={scoreColor(score)}>{score}/5</span>
            </button>

            <div className="mt-1 h-1.5 w-full rounded-full bg-border">
              <div
                className={`h-full rounded-full transition-all duration-300 ${barBgColor(score)}`}
                style={{ width: `${fillPct}%` }}
              />
            </div>

            {isExpanded && (
              <p className="mt-1 text-text-muted leading-snug">{reasoning}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
