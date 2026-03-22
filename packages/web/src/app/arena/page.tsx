'use client';

import { useEffect, useState } from 'react';
import { TournamentLive } from '@/components/TournamentLive';

export default function ArenaPage() {
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check for existing tournament on mount (survives page reload)
  useEffect(() => {
    fetch('/api/arena/tournament/current')
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data.active && data.tournamentId) {
            setTournamentId(data.tournamentId);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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
        if (data.tournamentId) setTournamentId(data.tournamentId);
        return;
      }
      setTournamentId(data.tournamentId);
    } catch (err) {
      setError(String(err));
    } finally {
      setStarting(false);
    }
  }

  function handleNewTournament() {
    setTournamentId(null);
    setError(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center">
        <div className="text-sm opacity-50">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-current/10 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/" className="text-sm text-text-secondary hover:text-accent transition-colors">Chat</a>
          <a href="/blog" className="text-sm text-text-secondary hover:text-accent transition-colors">Blog</a>
          <span className="text-sm font-semibold">Arena</span>
        </div>
        {tournamentId && (
          <button
            onClick={handleNewTournament}
            className="text-xs opacity-50 hover:opacity-100 transition-opacity"
          >
            New Tournament
          </button>
        )}
      </header>

      <main className="max-w-3xl mx-auto py-8 px-4">
        {!tournamentId ? (
          <div className="space-y-6 text-center">
            <h1 className="text-2xl font-semibold font-[family-name:var(--font-literata)]">
              Arena Tournament
            </h1>
            <p className="text-sm opacity-60 max-w-md mx-auto">
              Evolutionary selection over tool compositions. Agents compete across encounters,
              the fittest survive and reproduce. Watch it happen in real time.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => startTournament(false)}
                disabled={starting}
                className="px-4 py-2 bg-accent text-white rounded text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                title="Requires ANTHROPIC_API_KEY. Runs ~500+ Haiku calls."
              >
                {starting ? 'Starting...' : 'Live Tournament'}
              </button>
              <button
                onClick={() => startTournament(true)}
                disabled={starting}
                className="px-4 py-2 border border-current/20 rounded text-sm hover:bg-current/5 disabled:opacity-50 transition-colors"
              >
                {starting ? 'Starting...' : 'Mock Tournament'}
              </button>
            </div>
            {error && (
              <div className="text-sm text-red-600">{error}</div>
            )}
          </div>
        ) : (
          <TournamentLive tournamentId={tournamentId} />
        )}
      </main>
    </div>
  );
}
