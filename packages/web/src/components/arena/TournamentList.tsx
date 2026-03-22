'use client';

import type { TournamentSummary } from '@/lib/arena-types';
import { TOOL_BG } from '@/lib/arena-types';

export function TournamentList({
  tournaments,
  compact = false,
}: {
  tournaments: TournamentSummary[];
  compact?: boolean;
}) {
  if (tournaments.length === 0) {
    return <div className="text-xs opacity-40 text-center py-4">No tournaments</div>;
  }

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      {tournaments.map(t => (
        <a
          key={t.id}
          href={`/arena/${t.id}`}
          className={`block w-full text-left rounded border border-current/5 hover:border-current/20 transition-colors flex items-center justify-between ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'}`}
        >
          <div className="font-mono opacity-70">{t.id.slice(0, 8)}</div>
          <div className="flex items-center gap-3">
            {t.winnerTools && (
              <div className="flex gap-0.5">
                {t.winnerTools.map(tool => (
                  <span key={tool} className={`px-1 rounded text-xs font-mono ${TOOL_BG[tool] ?? 'bg-gray-100'}`}>
                    {tool}
                  </span>
                ))}
              </div>
            )}
            <span className="opacity-50 text-xs">
              {t.generationCount}g · fit {t.bestFitness.toFixed(2)}
            </span>
            {t.status === 'interrupted' && (
              <span className="text-yellow-600 text-xs">interrupted</span>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}
