'use client';

import { useEffect, useState } from 'react';
import { TournamentList } from '@/components/arena/TournamentList';
import type { TournamentSummary } from '@/lib/arena-types';

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/arena/tournaments')
      .then(async (res) => {
        if (res.ok) setTournaments(await res.json());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-sm opacity-50">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold font-[family-name:var(--font-literata)]">
        All Tournaments
      </h1>
      <TournamentList tournaments={tournaments} />
    </div>
  );
}
