'use client';

import { useState } from 'react';
import type { MemoryActivity, MemoryWriteInfo } from '@/lib/types';

type MemoryInspectorProps = {
  memory: MemoryActivity | undefined;
};

function UncertaintyBadge({ uncertainty }: { uncertainty: number }) {
  const confidence = 1 - uncertainty;
  let colorClass = 'bg-success/20 text-success';
  if (uncertainty > 0.6) {
    colorClass = 'bg-warning/20 text-warning';
  } else if (uncertainty > 0.3) {
    colorClass = 'bg-accent/20 text-accent';
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${colorClass}`}>
      {(confidence * 100).toFixed(0)}%
    </span>
  );
}

function DeduplicationBadge({ dedup }: { dedup: 'new' | 'reinforced' | 'updated' }) {
  const labels: Record<string, { text: string; class: string }> = {
    new: { text: 'new', class: 'bg-success/20 text-success' },
    reinforced: { text: 'reinforced', class: 'bg-accent/20 text-accent' },
    updated: { text: 'updated', class: 'bg-warning/20 text-warning' },
  };
  const { text, class: cls } = labels[dedup];
  return <span className={`rounded px-1.5 py-0.5 text-xs ${cls}`}>{text}</span>;
}

function MemoryWriteDetail({ write }: { write: MemoryWriteInfo }) {
  const m = write.memory;
  let description = '';
  switch (m.type) {
    case 'observation':
      description = `${m.subject}: ${m.content}`;
      break;
    case 'learning':
      description = `${m.topic}: ${m.insight}`;
      break;
    case 'relationship':
      description = `${m.entity}: ${m.context}`;
      break;
    case 'reflection':
      description = m.insight;
      break;
  }

  return (
    <div className="flex items-start gap-2 rounded bg-bg px-2 py-1 text-xs">
      <span className="font-medium text-text-secondary">{m.type}</span>
      <span className="flex-1 text-text-muted">{description}</span>
      <UncertaintyBadge uncertainty={m.uncertainty} />
      <DeduplicationBadge dedup={write.deduplication} />
    </div>
  );
}

export function MemoryInspector({ memory }: MemoryInspectorProps) {
  const [expanded, setExpanded] = useState(false);

  if (!memory) {
    return (
      <div className="px-3 py-2 text-xs text-text-muted">
        No memory activity
      </div>
    );
  }

  const totalRecalled = memory.memoriesRetrieved;
  const totalWritten = memory.memoriesWritten.length;

  return (
    <div className="border-t border-border-subtle">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs hover:bg-bg-hover"
      >
        <span className="font-medium text-text">Memory</span>
        <span className="text-text-muted">
          <span className="font-medium text-text">{totalRecalled}</span> recalled
        </span>
        <span className="text-text-muted">
          <span className="font-medium text-text">{totalWritten}</span> written
        </span>
        <span className="ml-auto text-text-muted">{expanded ? '▼' : '▶'}</span>
      </button>

      {expanded && (
        <div className="space-y-2 px-3 pb-2 text-xs">
          {/* Recall breakdown */}
          {totalRecalled > 0 && (
            <div>
              <span className="text-text-muted">Recalled by type:</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {Object.entries(memory.memoryTypes).map(([type, count]) => (
                  <span
                    key={type}
                    className="rounded bg-bg px-1.5 py-0.5 text-text-secondary"
                  >
                    {type}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Writes */}
          {totalWritten > 0 && (
            <div>
              <span className="text-text-muted">Written:</span>
              <div className="mt-1 space-y-1">
                {memory.memoriesWritten.map((write, i) => (
                  <MemoryWriteDetail key={write.memory.id ?? i} write={write} />
                ))}
              </div>
            </div>
          )}

          {totalRecalled === 0 && totalWritten === 0 && (
            <span className="text-text-muted">No memories recalled or written this turn.</span>
          )}
        </div>
      )}
    </div>
  );
}
