'use client';

import { useRouter } from 'next/navigation';
import { EncounterHeatmap } from '@/components/EncounterHeatmap';
import { FeaturedDeath } from '@/components/FeaturedDeath';
import type { TournamentDetail } from '@/lib/arena-types';
import { TOOL_BG } from '@/lib/arena-types';

export function TournamentDetailView({ detail }: { detail: TournamentDetail }) {
  const router = useRouter();
  const lastGen = detail.generations[detail.generations.length - 1] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold font-[family-name:var(--font-literata)]">
            Tournament {detail.id.slice(0, 8)}
          </h1>
          <div className="text-xs opacity-50 font-mono mt-0.5">
            {detail.generations.length} generation{detail.generations.length !== 1 ? 's' : ''} · {lastGen?.populationSize ?? 0} agents
            {detail.complete && ` · best: ${detail.complete.bestFitness.toFixed(3)}`}
          </div>
        </div>
        {detail.complete?.winnerTools && (
          <div className="flex gap-1">
            {detail.complete.winnerTools.map(t => (
              <span key={t} className={`px-1.5 py-0.5 rounded text-xs font-mono ${TOOL_BG[t] ?? 'bg-gray-100'}`}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {lastGen && (
        <EncounterHeatmap
          agents={lastGen.agents}
          fitness={lastGen.fitness}
          onCellClick={(agentId, encounterId) =>
            router.push(`/arena/${detail.id}/${agentId}/${encounterId}`)
          }
        />
      )}

      {lastGen && (
        <FeaturedDeath agents={lastGen.agents} fitness={lastGen.fitness} />
      )}
    </div>
  );
}
