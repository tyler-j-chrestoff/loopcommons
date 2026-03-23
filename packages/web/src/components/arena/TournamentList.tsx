'use client';

import type { TournamentSummary } from '@/lib/arena-types';
import { TOOL_BG } from '@/lib/arena-types';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    complete: 'text-green-600 bg-green-50',
    interrupted: 'text-yellow-600 bg-yellow-50',
    running: 'text-blue-600 bg-blue-50',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs ${styles[status] ?? 'text-gray-500 bg-gray-50'}`}>
      {status}
    </span>
  );
}

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
          className={`block rounded border border-current/5 hover:border-current/20 transition-colors ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-xs opacity-60">{t.id.slice(0, 8)}</span>
              <StatusBadge status={t.status} />
            </div>
            {t.winnerTools && (
              <div className="flex gap-0.5 shrink-0">
                {t.winnerTools.map(tool => (
                  <span key={tool} className={`px-1 rounded text-xs font-mono ${TOOL_BG[tool] ?? 'bg-gray-100'}`}>
                    {tool}
                  </span>
                ))}
              </div>
            )}
          </div>
          {!compact && (
            <div className="flex items-center gap-3 mt-1.5 text-xs opacity-50">
              {t.startedAt && (
                <span>{formatDate(t.startedAt)} {formatTime(t.startedAt)}</span>
              )}
              <span>{t.generationCount} gen{t.generationCount !== 1 ? 's' : ''}</span>
              <span>{t.agentCount} agents</span>
              <span>fit {t.bestFitness.toFixed(3)}</span>
            </div>
          )}
          {compact && (
            <div className="flex items-center gap-3 mt-0.5 text-xs opacity-40">
              {t.startedAt && <span>{formatDate(t.startedAt)}</span>}
              <span>{t.generationCount}g · fit {t.bestFitness.toFixed(2)}</span>
            </div>
          )}
        </a>
      ))}
    </div>
  );
}
