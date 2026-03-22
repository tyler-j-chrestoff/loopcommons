'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { TournamentSnapshot, TaskResultSummary } from '@/lib/tournament-manager';

type TournamentEvent = {
  type: string;
  [key: string]: unknown;
};

const TOOL_COLORS: Record<string, string> = {
  inspect: 'text-cyan-600',
  act: 'text-red-600',
  search: 'text-yellow-600',
  model: 'text-purple-600',
};

const TOOL_BG: Record<string, string> = {
  inspect: 'bg-cyan-100',
  act: 'bg-red-100',
  search: 'bg-yellow-100',
  model: 'bg-purple-100',
};

// ---------------------------------------------------------------------------
// Fitness chart — SVG line chart of best fitness over generations
// ---------------------------------------------------------------------------

const CHART_W = 560;
const CHART_H = 160;
const PAD = { top: 12, right: 16, bottom: 28, left: 48 };

function FitnessChart({ history }: { history: number[] }) {
  if (history.length < 2) return null;

  const minY = Math.min(...history) - 0.02;
  const maxY = Math.max(...history) + 0.02;
  const rangeY = maxY - minY || 0.1;
  const innerW = CHART_W - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (i / (history.length - 1)) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - minY) / rangeY) * innerH;
  const linePath = history.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const yTicks = Array.from({ length: 5 }, (_, i) => minY + (rangeY * i) / 4);

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" aria-label="Fitness progression">
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={CHART_W - PAD.right} y1={y(tick)} y2={y(tick)}
            stroke="currentColor" strokeOpacity={0.1} />
          <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end"
            className="fill-current text-[10px] opacity-50">{tick.toFixed(2)}</text>
        </g>
      ))}
      <path d={linePath} fill="none" stroke="var(--color-emerald-500)" strokeWidth={2} />
      {history.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={3} fill="var(--color-emerald-500)" />
      ))}
      <text x={CHART_W / 2} y={CHART_H - 4} textAnchor="middle"
        className="fill-current text-[10px] opacity-50">Generation</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Population grid — shows each agent's tools
// ---------------------------------------------------------------------------

function PopulationGrid({ population, fitness }: {
  population: Array<{ id: string; tools: string[] }>;
  fitness: Array<{ agentId: string; fitnessScore: number }>;
}) {
  const fitnessMap = new Map(fitness.map(f => [f.agentId, f.fitnessScore]));
  const sorted = [...population].sort((a, b) =>
    (fitnessMap.get(b.id) ?? 0) - (fitnessMap.get(a.id) ?? 0),
  );

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {sorted.map(agent => (
        <div key={agent.id} className="rounded border border-current/10 p-2 text-xs">
          <div className="flex gap-1 flex-wrap mb-1">
            {agent.tools.map(t => (
              <span key={t} className={`px-1 rounded ${TOOL_BG[t] ?? 'bg-gray-100'} ${TOOL_COLORS[t] ?? ''} font-mono`}>
                {t}
              </span>
            ))}
          </div>
          <div className="opacity-60 font-mono">
            {fitnessMap.has(agent.id)
              ? `fitness: ${fitnessMap.get(agent.id)!.toFixed(3)}`
              : 'evaluating...'}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Encounter results grid — per-agent per-encounter scores
// ---------------------------------------------------------------------------

function EncounterResultsGrid({ population, fitness }: {
  population: Array<{ id: string; tools: string[] }>;
  fitness: Array<{ agentId: string; fitnessScore: number; taskResults: TaskResultSummary[] }>;
}) {
  if (fitness.length === 0 || fitness[0].taskResults.length === 0) return null;

  const encounterIds = fitness[0].taskResults.map(tr => tr.encounterId);
  const fitnessMap = new Map(fitness.map(f => [f.agentId, f]));
  const sorted = [...population].sort((a, b) =>
    (fitnessMap.get(b.id)?.fitnessScore ?? 0) - (fitnessMap.get(a.id)?.fitnessScore ?? 0),
  );

  function scoreColor(score: number): string {
    if (score >= 0.8) return 'bg-emerald-200 text-emerald-900';
    if (score >= 0.4) return 'bg-yellow-200 text-yellow-900';
    if (score > 0) return 'bg-orange-200 text-orange-900';
    return 'bg-red-100 text-red-800';
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs font-mono w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left p-1 border-b border-current/10 sticky left-0 bg-bg">Agent</th>
            {encounterIds.map(eid => (
              <th key={eid} className="p-1 border-b border-current/10 text-center min-w-[3rem]">
                {eid.toUpperCase()}
              </th>
            ))}
            <th className="p-1 border-b border-current/10 text-center font-bold">Fit</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(agent => {
            const f = fitnessMap.get(agent.id);
            return (
              <tr key={agent.id}>
                <td className="p-1 border-b border-current/5 sticky left-0 bg-bg">
                  <div className="flex gap-0.5">
                    {agent.tools.map(t => (
                      <span key={t} className={`${TOOL_COLORS[t] ?? ''}`}>{t[0]}</span>
                    ))}
                  </div>
                </td>
                {encounterIds.map(eid => {
                  const tr = f?.taskResults.find(t => t.encounterId === eid);
                  const score = tr?.score ?? 0;
                  return (
                    <td key={eid} className={`p-1 border-b border-current/5 text-center ${scoreColor(score)}`}>
                      {score.toFixed(1)}
                    </td>
                  );
                })}
                <td className="p-1 border-b border-current/5 text-center font-bold">
                  {(f?.fitnessScore ?? 0).toFixed(3)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event log — scrolling list of tournament events
// ---------------------------------------------------------------------------

function EventLog({ events }: { events: TournamentEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo(0, ref.current.scrollHeight);
  }, [events.length]);

  return (
    <div ref={ref} className="max-h-48 overflow-y-auto border border-current/10 rounded p-2 text-xs font-mono space-y-0.5">
      {events.length === 0 && <div className="opacity-40">Waiting for events...</div>}
      {events.map((e, i) => (
        <div key={i} className="opacity-70">
          <span className="text-emerald-600">{e.type}</span>
          {e.type === 'evaluation:complete' && ` agent=${(e as any).agentId} fitness=${((e as any).fitness?.fitnessScore ?? 0).toFixed(3)}`}
          {e.type === 'generation:start' && ` gen=${(e as any).generation}`}
          {e.type === 'generation:complete' && ` gen=${(e as any).result?.generation}`}
          {e.type === 'selection:complete' && ` survivors=${(e as any).survivors?.length}`}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TournamentLive — main component
// ---------------------------------------------------------------------------

export function TournamentLive({ tournamentId }: { tournamentId: string }) {
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | null>(null);
  const [events, setEvents] = useState<TournamentEvent[]>([]);
  const [fitnessHistory, setFitnessHistory] = useState<number[]>([]);
  const [connected, setConnected] = useState(false);

  // Fetch initial state
  useEffect(() => {
    fetch(`/api/arena/tournament/${tournamentId}/state`)
      .then(r => r.json())
      .then(setSnapshot)
      .catch(() => {});
  }, [tournamentId]);

  // SSE stream
  useEffect(() => {
    const eventSource = new EventSource(`/api/arena/tournament/${tournamentId}/stream`);
    setConnected(true);

    eventSource.onmessage = (msg) => {
      try {
        const event: TournamentEvent = JSON.parse(msg.data);
        setEvents(prev => [...prev, event]);

        if (event.type === 'generation:complete') {
          const result = (event as any).result;
          if (result?.fitness?.length) {
            const best = Math.max(...result.fitness.map((f: any) => f.fitnessScore));
            setFitnessHistory(prev => [...prev, best]);
          }
        }

        // Refresh snapshot periodically
        if (['generation:complete', 'tournament:complete', 'tournament:converged'].includes(event.type)) {
          fetch(`/api/arena/tournament/${tournamentId}/state`)
            .then(r => r.json())
            .then(setSnapshot)
            .catch(() => {});
        }
      } catch { /* ignore parse errors */ }
    };

    eventSource.onerror = () => {
      setConnected(false);
    };

    return () => {
      eventSource.close();
      setConnected(false);
    };
  }, [tournamentId]);

  const isComplete = snapshot?.status === 'complete' || snapshot?.status === 'error';

  return (
    <div className="space-y-4 p-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold font-[family-name:var(--font-literata)]">
          Tournament {tournamentId.slice(0, 8)}
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${
            connected ? 'bg-emerald-500' : isComplete ? 'bg-gray-400' : 'bg-red-500'
          }`} />
          <span className="opacity-60">
            {isComplete ? snapshot?.status : connected ? 'streaming' : 'disconnected'}
          </span>
        </div>
      </div>

      {/* Stats row */}
      {snapshot && (
        <div className="grid grid-cols-4 gap-3 text-center text-xs">
          <div className="border border-current/10 rounded p-2">
            <div className="text-lg font-mono">{snapshot.generation}</div>
            <div className="opacity-50">Generation</div>
          </div>
          <div className="border border-current/10 rounded p-2">
            <div className="text-lg font-mono">{snapshot.population.length}</div>
            <div className="opacity-50">Population</div>
          </div>
          <div className="border border-current/10 rounded p-2">
            <div className="text-lg font-mono">{snapshot.bestFitness.toFixed(3)}</div>
            <div className="opacity-50">Best Fitness</div>
          </div>
          <div className="border border-current/10 rounded p-2">
            <div className="text-lg font-mono">
              {snapshot.bestAgent ? `[${snapshot.bestAgent.tools.join(', ')}]` : '-'}
            </div>
            <div className="opacity-50">Best Agent</div>
          </div>
        </div>
      )}

      {/* Fitness chart */}
      <div>
        <h3 className="text-sm font-semibold mb-1 opacity-70">Fitness Progression</h3>
        <FitnessChart history={fitnessHistory} />
        {fitnessHistory.length < 2 && (
          <div className="text-xs opacity-40 text-center py-4">Chart appears after 2+ generations</div>
        )}
      </div>

      {/* Population */}
      {snapshot && snapshot.population.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-1 opacity-70">Population (Gen {snapshot.generation})</h3>
          <PopulationGrid population={snapshot.population} fitness={snapshot.fitness} />
        </div>
      )}

      {/* Encounter results grid */}
      {snapshot && snapshot.fitness.length > 0 && snapshot.fitness[0].taskResults.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-1 opacity-70">Encounter Results (Gen {snapshot.generation})</h3>
          <EncounterResultsGrid population={snapshot.population} fitness={snapshot.fitness} />
        </div>
      )}

      {/* Event log */}
      <div>
        <h3 className="text-sm font-semibold mb-1 opacity-70">Event Log</h3>
        <EventLog events={events} />
      </div>

      {/* Error display */}
      {snapshot?.error && (
        <div className="border border-red-300 bg-red-50 rounded p-3 text-sm text-red-700">
          {snapshot.error}
        </div>
      )}
    </div>
  );
}
