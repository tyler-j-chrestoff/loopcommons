'use client';

import { useEffect, useState } from 'react';
import { EncounterReplay } from './EncounterReplay';
import { ArenaBreadcrumb } from './ArenaBreadcrumb';
import type { EncounterTraceMeta, EncounterTraceStep } from '@/lib/tournament-loader';

type ReplayPageContentProps = {
  tournamentId: string;
  agentId: string;
  encounterId: string;
};

type TraceData = {
  meta: EncounterTraceMeta;
  steps: EncounterTraceStep[];
};

export function ReplayPageContent({ tournamentId, agentId, encounterId }: ReplayPageContentProps) {
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/arena/tournaments/${tournamentId}/traces/${agentId}/${encounterId}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? 'Trace not found');
          return;
        }
        setTrace(await res.json());
      })
      .catch(() => setError('Failed to load trace'))
      .finally(() => setLoading(false));
  }, [tournamentId, agentId, encounterId]);

  if (loading) {
    return <div className="text-xs opacity-50 text-center py-8">Loading trace...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-8 space-y-3">
        <div className="text-sm text-red-600">{error}</div>
        <a href="/arena" className="text-xs text-accent hover:underline">Back to Arena</a>
      </div>
    );
  }

  if (!trace) return null;

  return (
    <div className="space-y-4">
      <ArenaBreadcrumb crumbs={[
        { label: 'Arena', href: '/arena' },
        { label: tournamentId.slice(0, 8), href: `/arena/${tournamentId}` },
        { label: encounterId },
      ]} />
      <EncounterReplay meta={trace.meta} steps={trace.steps} />
    </div>
  );
}
