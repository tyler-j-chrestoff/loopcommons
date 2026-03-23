'use client';

import { TournamentLive } from '@/components/TournamentLive';
import { ArenaBreadcrumb } from '@/components/arena/ArenaBreadcrumb';

export default function TournamentLiveClient({ tournamentId }: { tournamentId: string }) {
  return (
    <div className="space-y-4">
      <ArenaBreadcrumb crumbs={[
        { label: 'Arena', href: '/arena' },
        { label: tournamentId.slice(0, 8), href: `/arena/${tournamentId}` },
        { label: 'Live' },
      ]} />
      <TournamentLive tournamentId={tournamentId} />
    </div>
  );
}
