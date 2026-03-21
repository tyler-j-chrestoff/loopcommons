'use client';

/**
 * TournamentHistory — collapsible panel showing evolutionary tournament results.
 *
 * Fetches from /api/metrics/arena-tournament. Displays:
 *   - FitnessChart (generation fitness over time)
 *   - ToolFrequency (which tools appear in winners)
 *   - Winner summary
 *   - Generation timeline with mutations/crossovers
 */

import { useState, useEffect } from 'react';
import { FitnessChart } from './FitnessChart';
import { ToolFrequency } from './ToolFrequency';
import type { TournamentData, TournamentGenerationSummary } from '@/lib/arena-types';
import { TOOL_FILL_COLORS } from '@/lib/arena-types';

export function TournamentHistory() {
  const [data, setData] = useState<TournamentData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [selectedGen, setSelectedGen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/metrics/arena-tournament')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(e => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="p-3 rounded text-sm" style={{ border: '1px solid var(--color-error)', color: 'var(--color-error)' }}>
        Tournament data unavailable: {error}
      </div>
    );
  }

  if (!data || data.generations.length === 0) {
    return (
      <div className="p-3 rounded text-sm" style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
        No tournament data. Run: <code className="font-mono text-xs">npm run arena:tournament</code>
      </div>
    );
  }

  const { generations, complete } = data;
  const selectedGenData = selectedGen !== null
    ? generations.find(g => g.generation === selectedGen)
    : null;

  return (
    <div className="rounded-lg" style={{ border: '1px solid var(--color-border)' }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-left"
        style={{ borderBottom: expanded ? '1px solid var(--color-border)' : 'none' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {expanded ? '▼' : '▶'}
          </span>
          <span className="font-medium text-sm">Tournament Evolution</span>
          {complete && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--color-success)', color: 'white' }}>
              {complete.generationsRun} gen
            </span>
          )}
        </div>
        {complete && (
          <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
            best: {complete.bestFitness.toFixed(3)}
          </span>
        )}
      </button>

      {expanded && (
        <div className="p-4 space-y-6">
          {/* Winner summary */}
          {complete && complete.winnerTools && (
            <div className="flex items-center gap-3 p-3 rounded" style={{ backgroundColor: 'var(--color-bg-surface)' }}>
              <div className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Winner:</div>
              <div className="flex gap-1">
                {complete.winnerTools.map(tool => (
                  <span
                    key={tool}
                    className="px-2 py-0.5 rounded text-xs font-mono text-white"
                    style={{ backgroundColor: TOOL_FILL_COLORS[tool] ?? '#666' }}
                  >
                    {tool}
                  </span>
                ))}
              </div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                origin: {complete.winnerOrigin} | fitness: {complete.bestFitness.toFixed(3)}
              </div>
            </div>
          )}

          {/* Fitness chart */}
          <div>
            <h3 className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Fitness over generations
            </h3>
            <FitnessChart generations={generations} />
          </div>

          {/* Tool frequency */}
          <ToolFrequency generations={generations} />

          {/* Generation timeline */}
          <div>
            <h3 className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Generation details
            </h3>
            <div className="space-y-1">
              {generations.map(g => (
                <GenerationRow
                  key={g.generation}
                  generation={g}
                  isSelected={selectedGen === g.generation}
                  onClick={() => setSelectedGen(selectedGen === g.generation ? null : g.generation)}
                />
              ))}
            </div>
          </div>

          {/* Selected generation detail */}
          {selectedGenData && (
            <GenerationDetail generation={selectedGenData} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GenerationRow({
  generation: g,
  isSelected,
  onClick,
}: {
  generation: TournamentGenerationSummary;
  isSelected: boolean;
  onClick: () => void;
}) {
  const best = g.fitness.reduce((a, b) => a.fitnessScore > b.fitnessScore ? a : b);
  const avg = g.fitness.reduce((s, f) => s + f.fitnessScore, 0) / g.fitness.length;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-1.5 rounded text-left transition-colors"
      style={{
        backgroundColor: isSelected ? 'var(--color-bg-hover)' : 'transparent',
        border: isSelected ? '1px solid var(--color-border)' : '1px solid transparent',
      }}
    >
      <span className="text-xs tabular-nums w-8" style={{ color: 'var(--color-text-secondary)' }}>
        G{g.generation}
      </span>
      {/* Fitness bar */}
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${best.fitnessScore * 100}%`, backgroundColor: 'var(--color-success)' }}
        />
      </div>
      <span className="text-xs tabular-nums w-12 text-right" style={{ color: 'var(--color-text)' }}>
        {best.fitnessScore.toFixed(3)}
      </span>
      <span className="text-xs tabular-nums w-8 text-right" style={{ color: 'var(--color-text-secondary)' }}>
        {g.mutations.length}m
      </span>
      <span className="text-xs tabular-nums w-8 text-right" style={{ color: 'var(--color-text-secondary)' }}>
        {g.crossovers.length}x
      </span>
      <span className="text-xs tabular-nums w-14 text-right" style={{ color: 'var(--color-text-secondary)' }}>
        {g.durationMs}ms
      </span>
    </button>
  );
}

function GenerationDetail({ generation: g }: { generation: TournamentGenerationSummary }) {
  const sorted = [...g.fitness].sort((a, b) => b.fitnessScore - a.fitnessScore);

  return (
    <div className="p-3 rounded space-y-3" style={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}>
      <div className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        Generation {g.generation} — {g.populationSize} agents
      </div>

      {/* Agent table */}
      <div className="space-y-1">
        {sorted.map((f, i) => {
          const agent = g.agents.find(a => a.id === f.agentId);
          if (!agent) return null;
          const isSurvivor = g.survivors.includes(f.agentId);

          return (
            <div key={f.agentId} className="flex items-center gap-2 text-xs">
              <span className="w-4 text-right tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                {i + 1}
              </span>
              {isSurvivor ? (
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} title="Survivor" />
              ) : (
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-border)' }} title="Eliminated" />
              )}
              <div className="flex gap-0.5">
                {agent.tools.map(tool => (
                  <span
                    key={tool}
                    className="px-1 py-0.5 rounded text-white text-[10px] font-mono"
                    style={{ backgroundColor: TOOL_FILL_COLORS[tool] ?? '#666' }}
                  >
                    {tool.charAt(0)}
                  </span>
                ))}
              </div>
              <span className="tabular-nums" style={{ color: 'var(--color-text)' }}>
                {f.fitnessScore.toFixed(3)}
              </span>
              <span className="px-1 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)' }}>
                {agent.origin}
              </span>
              <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                comp:{f.metrics.completionRate.toFixed(1)} surv:{f.metrics.survivalRate.toFixed(1)} steps:{f.metrics.meanSteps.toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mutations */}
      {g.mutations.length > 0 && (
        <div className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
          Mutations: {g.mutations.map(m =>
            `${m.type}(${m.toolRemoved ? `-${m.toolRemoved}` : ''}${m.toolAdded ? `+${m.toolAdded}` : ''})`
          ).join(', ')}
        </div>
      )}

      {/* Crossovers */}
      {g.crossovers.length > 0 && (
        <div className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
          Crossovers: {g.crossovers.map(c =>
            `${c.memoryCounts.parent1}+${c.memoryCounts.parent2}→${c.memoryCounts.merged} memories`
          ).join(', ')}
        </div>
      )}
    </div>
  );
}
