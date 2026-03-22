'use client';

import type { GraveyardEntry } from '@/lib/graveyard';

const TOOL_BG: Record<string, string> = {
  inspect: 'bg-cyan-100 text-cyan-700',
  act: 'bg-red-100 text-red-700',
  search: 'bg-yellow-100 text-yellow-700',
  model: 'bg-purple-100 text-purple-700',
};

export function DeathCard({ entry, featured }: { entry: GraveyardEntry; featured?: boolean }) {
  const replayUrl = `/arena/${entry.tournamentId}/${entry.agentId}/${entry.encounterId}`;

  return (
    <a
      href={replayUrl}
      className={`block border rounded-lg p-4 hover:border-red-300 transition-colors ${
        featured
          ? 'border-red-200 bg-red-50/50'
          : 'border-current/10 hover:bg-red-50/30'
      }`}
      {...(featured ? { 'data-featured': true } : {})}
    >
      {featured && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold opacity-70">Featured Death</span>
        </div>
      )}

      <div className="flex gap-1 flex-wrap mb-2">
        {entry.tools.map(t => (
          <span key={t} className={`px-1.5 py-0.5 rounded text-xs font-mono ${TOOL_BG[t] ?? 'bg-gray-100'}`}>
            {t}
          </span>
        ))}
      </div>

      <p className="text-sm opacity-80">{entry.epitaph}</p>

      <div className="text-xs opacity-50 mt-2 font-mono flex gap-3">
        <span>{entry.encounterId}</span>
        <span>{entry.score.toFixed(2)}</span>
        <span>{entry.stepCount} steps</span>
        <span>{entry.deathCause}</span>
      </div>
    </a>
  );
}
