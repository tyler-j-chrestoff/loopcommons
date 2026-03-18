'use client';

import { useState, useEffect } from 'react';

type ThreadSession = {
  id: string;
  date: string;
  messageCount: number;
  eventCount: number;
  durationMs: number;
  parentSessionId?: string;
};

type SessionThreadProps = {
  sessionId: string | null;
};

export function SessionThread({ sessionId }: SessionThreadProps) {
  const [thread, setThread] = useState<ThreadSession[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    setLoading(true);

    fetch(`/api/sessions?thread=${sessionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.thread) {
          setThread(data.thread);
        }
      })
      .catch(() => {
        // Thread fetch is non-critical — silently ignore
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Only show if there's a thread with more than one session
  if (!sessionId || thread.length <= 1) return null;

  const currentIndex = thread.findIndex((s) => s.id === sessionId);

  return (
    <div className="text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-text-secondary hover:text-text transition-colors"
      >
        <span>{expanded ? '\u25BC' : '\u25B6'}</span>
        <span>Thread ({thread.length} sessions)</span>
        {loading && <span className="text-text-muted">...</span>}
      </button>

      {expanded && (
        <div className="mt-1 ml-3 flex flex-col gap-0.5">
          {thread.map((s, i) => {
            const isCurrent = s.id === sessionId;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-2 rounded px-1.5 py-0.5 ${
                  isCurrent
                    ? 'bg-accent/10 text-text'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                <span className="font-mono">{s.id.slice(0, 8)}</span>
                <span className="text-text-muted">{s.date}</span>
                <span className="text-text-muted">{s.messageCount}m</span>
                {isCurrent && (
                  <span className="text-accent text-[10px]">current</span>
                )}
                {i === 0 && !isCurrent && (
                  <button
                    onClick={() => window.open(`/api/sessions/${s.id}`, '_blank')}
                    className="text-text-muted hover:text-text-secondary"
                    title="View session JSON"
                  >
                    JSON
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
