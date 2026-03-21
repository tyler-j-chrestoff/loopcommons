'use client';

import type { ArenaStats } from '@/lib/arena-types';

type PathComparisonProps = {
  stats: ArenaStats | null;
};

const APPROACH_COLORS: Record<string, string> = {
  'observe-first': 'bg-cyan-500',
  'act-first': 'bg-red-500',
  'systematic': 'bg-green-500',
  'breadth-first': 'bg-yellow-500',
  'targeted': 'bg-purple-500',
};

export function PathComparison({ stats }: PathComparisonProps) {
  if (!stats) return null;

  const paths = Object.entries(stats.pathSummaries);
  const allCategories = new Set<string>();
  for (const [, ps] of paths) {
    for (const cat of Object.keys(ps.approachDistribution)) {
      allCategories.add(cat);
    }
  }
  const categories = [...allCategories].sort();

  return (
    <div className="flex flex-col gap-4 text-xs">
      <div className="flex items-center gap-2 text-text-secondary">
        <span className="font-medium text-text-primary">{stats.totalRuns} runs</span>
        <span>{stats.totalVictories} victories</span>
        <span>{stats.totalDeaths} deaths</span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => (
          <div key={cat} className="flex items-center gap-1">
            <div className={`w-2.5 h-2.5 rounded-sm ${APPROACH_COLORS[cat] ?? 'bg-gray-400'}`} />
            <span className="text-text-secondary">{cat}</span>
          </div>
        ))}
      </div>

      {/* Path bars */}
      {paths.map(([pathId, ps]) => {
        const deathRate = ps.runCount > 0 ? Math.round((ps.deaths / ps.runCount) * 100) : 0;
        const maxCount = Math.max(...Object.values(ps.approachDistribution), 1);

        return (
          <div key={pathId} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-text-primary w-20 truncate">{pathId}</span>
              <span className="text-text-muted">{ps.runCount} runs</span>
              <span className={deathRate > 40 ? 'text-red-600' : 'text-text-secondary'}>
                {deathRate}% death
              </span>
            </div>

            {categories.map(cat => {
              const count = ps.approachDistribution[cat] ?? 0;
              if (count === 0) return null;
              const width = Math.max((count / maxCount) * 100, 8);

              return (
                <div key={cat} className="flex items-center gap-1.5 pl-20">
                  <div
                    className={`h-3 rounded-sm ${APPROACH_COLORS[cat] ?? 'bg-gray-400'}`}
                    style={{ width: `${width}%`, minWidth: '4px' }}
                  />
                  <span className="text-text-muted whitespace-nowrap">{count}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
