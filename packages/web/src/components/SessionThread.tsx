'use client';

import { useState, useEffect, useRef } from 'react';

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
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!expanded) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [expanded]);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    setLoading(true);

    let parentId: string | null = null;
    try {
      parentId = localStorage.getItem('parentSessionId');
    } catch {
      // localStorage may not be available in some environments
    }
    const params = new URLSearchParams({ thread: sessionId });
    if (parentId) params.set('parent', parentId);

    fetch(`/api/sessions?${params}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.thread) {
          setThread(data.thread);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!sessionId || thread.length <= 1) return null;

  return (
    <div className="relative text-xs" ref={containerRef}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-text-secondary hover:text-text transition-colors"
      >
        <span>{expanded ? '\u25BC' : '\u25B6'}</span>
        <span>Thread ({thread.length})</span>
        {loading && <span className="text-text-muted">...</span>}
      </button>

      {expanded && (
        <div className="absolute top-full left-0 z-50 mt-1 w-64 max-h-60 overflow-y-auto rounded-lg border border-border bg-bg-surface shadow-lg">
          {thread.map((s) => {
            const isCurrent = s.id === sessionId;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-2 px-3 py-1.5 ${
                  isCurrent
                    ? 'bg-accent/10 text-text'
                    : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary cursor-pointer'
                }`}
                onClick={!isCurrent ? () => window.open(`/api/sessions/${s.id}`, '_blank') : undefined}
              >
                <span className="font-mono shrink-0">{s.id.slice(0, 8)}</span>
                <span className="shrink-0">{s.date}</span>
                <span className="shrink-0">{s.messageCount}m</span>
                {isCurrent && (
                  <span className="text-accent text-[10px] ml-auto">current</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
