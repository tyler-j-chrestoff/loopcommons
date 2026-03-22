'use client';

import { useEffect, useState } from 'react';
import { TournamentDetailView } from '@/components/arena/TournamentDetailView';
import type { TournamentDetail } from '@/lib/arena-types';

export default function TournamentDetailClient({ tournamentId }: { tournamentId: string }) {
  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/arena/tournaments/${tournamentId}`)
      .then(async (res) => {
        if (!res.ok) {
          setError('Tournament not found');
          return;
        }
        setDetail(await res.json());
      })
      .catch(() => setError('Failed to load tournament'))
      .finally(() => setLoading(false));
  }, [tournamentId]);

  if (loading) {
    return <div className="text-sm opacity-50">Loading...</div>;
  }

  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }

  if (!detail) return null;

  return <TournamentDetailView detail={detail} />;
}
