'use client';

import { TournamentLive } from '@/components/TournamentLive';

export default function TournamentLiveClient({ tournamentId }: { tournamentId: string }) {
  return (
    <div className="space-y-4">
      <a
        href={`/arena/${tournamentId}`}
        className="text-xs opacity-50 hover:opacity-100 transition-opacity"
      >
        Back to Results
      </a>
      <TournamentLive tournamentId={tournamentId} />
    </div>
  );
}
