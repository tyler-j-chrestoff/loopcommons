'use client';

import { useState } from 'react';

type SecurityEvent = {
  type: 'security:input-sanitized' | 'security:input-rejected';
  reason: string;
  timestamp: number;
};

type SecurityEventLogProps = {
  events: SecurityEvent[];
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function SecurityEventLog({ events }: SecurityEventLogProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-bg-hover"
      >
        <span className="text-text-muted">Security Events</span>
        {events.length > 0 && (
          <span className="rounded bg-error/20 px-1.5 py-0.5 text-error">{events.length}</span>
        )}
        <span className="ml-auto text-text-muted">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-2">
          {events.length === 0 ? (
            <p className="py-1 text-xs text-text-muted">No security events</p>
          ) : (
            <div className="space-y-1">
              {events.map((evt, i) => {
                const isSanitized = evt.type === 'security:input-sanitized';
                return (
                  <div key={i} className="flex items-start gap-2 rounded bg-bg px-2 py-1 text-xs">
                    <span className={`shrink-0 rounded px-1 py-0.5 ${isSanitized ? 'bg-warning/20 text-warning' : 'bg-error/20 text-error'}`}>
                      {isSanitized ? 'sanitized' : 'rejected'}
                    </span>
                    <span className="flex-1 text-text-secondary">{evt.reason}</span>
                    <span className="shrink-0 text-text-muted">{formatTime(evt.timestamp)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
