'use client';

/**
 * ToolFrequency — horizontal bar chart showing tool frequency in winning compositions.
 *
 * For each generation, shows which tools the survivors and winner have.
 * Reveals evolutionary pressure: which tools get selected for and which get dropped.
 */

import type { TournamentGenerationSummary } from '@/lib/arena-types';
import { TOOL_FILL_COLORS } from '@/lib/arena-types';

type ToolFrequencyProps = {
  generations: TournamentGenerationSummary[];
};

export function ToolFrequency({ generations }: ToolFrequencyProps) {
  if (generations.length === 0) {
    return <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>No tournament data yet.</p>;
  }

  // Count tool frequency in survivors across all generations
  const allTools = ['inspect', 'act', 'search', 'model'];
  const toolCounts: Record<string, number[]> = {};
  for (const tool of allTools) {
    toolCounts[tool] = [];
  }

  for (const gen of generations) {
    const survivorAgents = gen.agents.filter(a => gen.survivors.includes(a.id));
    for (const tool of allTools) {
      const count = survivorAgents.filter(a => a.tools.includes(tool)).length;
      toolCounts[tool].push(count);
    }
  }

  const maxCount = Math.max(
    ...Object.values(toolCounts).flatMap(counts => counts),
    1,
  );

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        Tool frequency in survivors by generation
      </div>

      {allTools.map(tool => (
        <div key={tool} className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono w-14" style={{ color: TOOL_FILL_COLORS[tool] }}>
              {tool}
            </span>
            <div className="flex-1 flex gap-[2px] items-end h-5">
              {toolCounts[tool].map((count, i) => (
                <div
                  key={i}
                  className="rounded-sm transition-all"
                  style={{
                    width: `${100 / generations.length}%`,
                    height: `${(count / maxCount) * 100}%`,
                    minHeight: count > 0 ? '2px' : '0px',
                    backgroundColor: TOOL_FILL_COLORS[tool],
                    opacity: 0.4 + (count / maxCount) * 0.6,
                  }}
                  title={`Gen ${i}: ${count} survivors with ${tool}`}
                />
              ))}
            </div>
            <span className="text-xs tabular-nums w-6 text-right" style={{ color: 'var(--color-text-secondary)' }}>
              {toolCounts[tool][toolCounts[tool].length - 1]}
            </span>
          </div>
        </div>
      ))}

      {/* Generation axis labels */}
      <div className="flex gap-[2px] ml-[72px]">
        {generations.map((g, i) => (
          <div
            key={i}
            className="text-center text-[8px]"
            style={{ width: `${100 / generations.length}%`, color: 'var(--color-text-secondary)' }}
          >
            {i === 0 || i === generations.length - 1 ? g.generation : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
