'use client';

import type { Round } from '@loopcommons/llm';
import { formatLatency } from '@/lib/format';

type TraceTimelineProps = {
  rounds: Round[];
};

export function TraceTimeline({ rounds }: TraceTimelineProps) {
  if (rounds.length === 0) return null;

  const traceStart = rounds[0].startedAt;
  const traceEnd = Math.max(...rounds.map(r => r.completedAt));
  const totalDuration = traceEnd - traceStart;

  if (totalDuration === 0) return null;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-text-muted">Timeline</span>
        <span className="text-text-muted">{formatLatency(totalDuration)}</span>
      </div>
      <div className="space-y-1">
        {rounds.map(round => {
          const left = ((round.startedAt - traceStart) / totalDuration) * 100;
          const width = Math.max((round.latencyMs / totalDuration) * 100, 1);

          // Tool executions within the round
          const toolBars = round.toolExecutions.map(te => {
            const tLeft = ((te.startedAt - traceStart) / totalDuration) * 100;
            const tWidth = Math.max((te.latencyMs / totalDuration) * 100, 0.5);
            return { id: te.toolCallId, left: tLeft, width: tWidth, error: !!te.error };
          });

          return (
            <div key={round.index} className="relative h-5">
              {/* Round bar */}
              <div
                className="absolute top-0 h-3 rounded-sm bg-accent/30"
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`Round ${round.index}: ${formatLatency(round.latencyMs)}`}
              />
              {/* Tool execution bars */}
              {toolBars.map(tb => (
                <div
                  key={tb.id}
                  className={`absolute top-3.5 h-1.5 rounded-sm ${tb.error ? 'bg-error/60' : 'bg-success/60'}`}
                  style={{ left: `${tb.left}%`, width: `${tb.width}%` }}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
