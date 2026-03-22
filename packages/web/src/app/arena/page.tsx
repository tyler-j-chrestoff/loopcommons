'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TournamentLive } from '@/components/TournamentLive';
import { EncounterHeatmap } from '@/components/EncounterHeatmap';
import { FeaturedDeath } from '@/components/FeaturedDeath';

type TournamentSummary = {
  id: string;
  status: string;
  generationCount: number;
  agentCount: number;
  bestFitness: number;
  winnerId: string | null;
  winnerTools: string[] | null;
  startedAt: string | null;
  completedAt: string | null;
};

type TournamentDetail = {
  id: string;
  generations: Array<{
    generation: number;
    populationSize: number;
    agents: Array<{ id: string; tools: string[] }>;
    fitness: Array<{
      agentId: string;
      fitnessScore: number;
      taskResults: Array<{ encounterId: string; resolved: boolean; score: number; stepCount: number; died: boolean; costEstimate: number }>;
    }>;
  }>;
  complete: {
    bestFitness: number;
    winnerId: string | null;
    winnerTools: string[] | null;
  } | null;
};

const TOOL_BG: Record<string, string> = {
  inspect: 'bg-cyan-100 text-cyan-700',
  act: 'bg-red-100 text-red-700',
  search: 'bg-yellow-100 text-yellow-700',
  model: 'bg-purple-100 text-purple-700',
};

export default function ArenaPage() {
  const router = useRouter();
  const [liveTournamentId, setLiveTournamentId] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<TournamentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/arena/tournament/current')
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            if (data.active && data.tournamentId) {
              setLiveTournamentId(data.tournamentId);
            }
          }
        })
        .catch(() => {}),
      fetch('/api/arena/tournaments')
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            setTournaments(data);
            // Auto-load the latest completed tournament
            if (data.length > 0) {
              const latest = data[0];
              loadDetail(latest.id);
            }
          }
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const loadDetail = useCallback((id: string) => {
    fetch(`/api/arena/tournaments/${id}`)
      .then(async (res) => {
        if (res.ok) {
          setSelectedDetail(await res.json());
        }
      })
      .catch(() => {});
  }, []);

  async function startTournament(mock: boolean) {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/arena/tournament', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxGenerations: 5, populationSize: 8, mock }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to start tournament');
        if (data.tournamentId) setLiveTournamentId(data.tournamentId);
        return;
      }
      setLiveTournamentId(data.tournamentId);
    } catch (err) {
      setError(String(err));
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center">
        <div className="text-sm opacity-50">Loading...</div>
      </div>
    );
  }

  // Get the last generation from selected detail for heatmap
  const lastGen = selectedDetail?.generations[selectedDetail.generations.length - 1] ?? null;

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-current/10 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/" className="text-sm text-text-secondary hover:text-accent transition-colors">Chat</a>
          <a href="/blog" className="text-sm text-text-secondary hover:text-accent transition-colors">Blog</a>
          <span className="text-sm font-semibold">Arena</span>
        </div>
        <div className="flex items-center gap-2">
          {liveTournamentId && (
            <button
              onClick={() => setLiveTournamentId(null)}
              className="text-xs opacity-50 hover:opacity-100 transition-opacity"
            >
              Back to Results
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto py-6 px-4">
        {/* Live tournament takes over when active */}
        {liveTournamentId ? (
          <TournamentLive tournamentId={liveTournamentId} />
        ) : tournaments.length === 0 ? (
          /* Empty state */
          <div className="space-y-6 text-center py-12">
            <div className="text-4xl opacity-20">⚔️</div>
            <p className="text-sm opacity-50">No tournaments yet</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => startTournament(false)}
                disabled={starting}
                className="px-4 py-2 bg-accent text-white rounded text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {starting ? 'Starting...' : 'Run Tournament'}
              </button>
              <button
                onClick={() => startTournament(true)}
                disabled={starting}
                className="px-4 py-2 border border-current/20 rounded text-sm hover:bg-current/5 disabled:opacity-50 transition-colors"
              >
                {starting ? 'Starting...' : 'Mock Tournament'}
              </button>
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
          </div>
        ) : (
          /* Results-first layout */
          <div className="space-y-6">
            {/* Latest tournament header */}
            {selectedDetail && (
              <div className="flex items-baseline justify-between">
                <div>
                  <h1 className="text-lg font-semibold font-[family-name:var(--font-literata)]">
                    Tournament {selectedDetail.id.slice(0, 8)}
                  </h1>
                  <div className="text-xs opacity-50 font-mono mt-0.5">
                    {selectedDetail.generations.length} generations · {lastGen?.populationSize ?? 0} agents
                    {selectedDetail.complete && ` · best: ${selectedDetail.complete.bestFitness.toFixed(3)}`}
                  </div>
                </div>
                {selectedDetail.complete?.winnerTools && (
                  <div className="flex gap-1">
                    {selectedDetail.complete.winnerTools.map(t => (
                      <span key={t} className={`px-1.5 py-0.5 rounded text-xs font-mono ${TOOL_BG[t] ?? 'bg-gray-100'}`}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Heatmap — the hero */}
            {lastGen && (
              <EncounterHeatmap
                agents={lastGen.agents}
                fitness={lastGen.fitness}
                onCellClick={(agentId, encounterId) =>
                  router.push(`/arena/${selectedDetail!.id}/${agentId}/${encounterId}`)
                }
              />
            )}

            {/* Featured Death */}
            {lastGen && (
              <FeaturedDeath agents={lastGen.agents} fitness={lastGen.fitness} />
            )}

            {/* Past tournaments */}
            {tournaments.length > 1 && (
              <div>
                <h2 className="text-sm font-semibold opacity-70 mb-2">Past Tournaments</h2>
                <div className="space-y-1">
                  {tournaments.slice(1).map(t => (
                    <button
                      key={t.id}
                      onClick={() => loadDetail(t.id)}
                      className="w-full text-left px-3 py-2 rounded border border-current/5 hover:border-current/20 transition-colors flex items-center justify-between text-xs"
                    >
                      <div className="font-mono opacity-70">{t.id.slice(0, 8)}</div>
                      <div className="flex items-center gap-3">
                        {t.winnerTools && (
                          <div className="flex gap-0.5">
                            {t.winnerTools.map(tool => (
                              <span key={tool} className={`px-1 rounded ${TOOL_BG[tool] ?? 'bg-gray-100'}`}>
                                {tool}
                              </span>
                            ))}
                          </div>
                        )}
                        <span className="opacity-50">
                          {t.generationCount}g · fit {t.bestFitness.toFixed(2)}
                        </span>
                        {t.status === 'interrupted' && (
                          <span className="text-yellow-600">interrupted</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Start button — below results, not the hero */}
            <div className="flex gap-3 pt-4 border-t border-current/10">
              <button
                onClick={() => startTournament(false)}
                disabled={starting}
                className="px-4 py-2 bg-accent text-white rounded text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {starting ? 'Starting...' : 'New Tournament'}
              </button>
              <button
                onClick={() => startTournament(true)}
                disabled={starting}
                className="px-4 py-2 border border-current/20 rounded text-sm hover:bg-current/5 disabled:opacity-50 transition-colors"
              >
                {starting ? 'Starting...' : 'Mock'}
              </button>
              {error && <div className="text-sm text-red-600 self-center">{error}</div>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
