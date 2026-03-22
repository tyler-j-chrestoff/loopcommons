'use client';

import { useEffect, useState } from 'react';
import { DeathCard } from './DeathCard';
import type { GraveyardEntry } from '@/lib/graveyard';

export function GraveyardSection() {
  const [entries, setEntries] = useState<GraveyardEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/arena/graveyard?limit=20')
      .then(async res => {
        if (res.ok) {
          const data = await res.json();
          setEntries(data.entries);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || entries.length === 0) return null;

  const [featured, ...rest] = entries;

  return (
    <div data-graveyard>
      <h2 className="text-sm font-semibold opacity-70 mb-3">The Graveyard</h2>

      <DeathCard entry={featured} featured />

      {rest.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          {rest.map(entry => (
            <DeathCard key={`${entry.agentId}-${entry.encounterId}`} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
