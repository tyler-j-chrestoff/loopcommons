'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TournamentDetailView } from '@/components/arena/TournamentDetailView';
import { TournamentList } from '@/components/arena/TournamentList';
import { GraveyardSection } from '@/components/GraveyardSection';
import type { TournamentSummary, TournamentDetail } from '@/lib/arena-types';

export default function ArenaPage() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [latestDetail, setLatestDetail] = useState<TournamentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback((id: string) => {
    fetch(`/api/arena/tournaments/${id}`)
      .then(async (res) => {
        if (res.ok) setLatestDetail(await res.json());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/arena/tournament/current')
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            if (data.active && data.tournamentId) {
              router.replace(`/arena/${data.tournamentId}/live`);
            }
          }
        })
        .catch(() => {}),
      fetch('/api/arena/tournaments')
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            setTournaments(data);
            if (data.length > 0) {
              loadDetail(data[0].id);
            }
          }
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [router, loadDetail]);

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
        if (data.tournamentId) router.push(`/arena/${data.tournamentId}/live`);
        return;
      }
      router.push(`/arena/${data.tournamentId}/live`);
    } catch (err) {
      setError(String(err));
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm opacity-50">Loading...</div>
      </div>
    );
  }

  if (tournaments.length === 0) {
    return (
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
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <h1 className="text-lg font-semibold font-[family-name:var(--font-literata)]">
            Tournaments
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => startTournament(true)}
              disabled={starting}
              className="px-3 py-1 border border-current/20 rounded text-xs hover:bg-current/5 disabled:opacity-50 transition-colors"
            >
              {starting ? 'Starting...' : 'Mock'}
            </button>
            <button
              onClick={() => startTournament(false)}
              disabled={starting}
              className="px-3 py-1 bg-accent text-white rounded text-xs hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {starting ? 'Starting...' : 'New Tournament'}
            </button>
          </div>
        </div>
        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
        <TournamentList tournaments={tournaments} />
      </div>

      {latestDetail && (
        <div>
          <h2 className="text-sm font-semibold opacity-70 mb-2">Latest Result</h2>
          <TournamentDetailView detail={latestDetail} />
        </div>
      )}

      <GraveyardSection />
    </div>
  );
}
