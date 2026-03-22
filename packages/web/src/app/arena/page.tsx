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
      {latestDetail && <TournamentDetailView detail={latestDetail} />}

      <GraveyardSection />

      {tournaments.length > 1 && (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-semibold opacity-70">Past Tournaments</h2>
            <a href="/arena/tournaments" className="text-xs opacity-50 hover:opacity-100 transition-opacity">
              View all
            </a>
          </div>
          <TournamentList tournaments={tournaments.slice(1)} compact />
        </div>
      )}

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
  );
}
