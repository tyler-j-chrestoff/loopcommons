'use client';

import { useState } from 'react';
import type { Trace, Round } from '@loopcommons/llm';
import { formatCost, formatTokens, formatLatency } from '@/lib/format';
import { TraceTimeline } from './TraceTimeline';

type TraceInspectorProps = {
  trace: Trace | null;
  liveRounds: Round[];
};

function RoundDetail({ round }: { round: Round }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs hover:bg-bg-hover"
      >
        <span className="font-medium text-text">R{round.index}</span>
        <span className="text-text-muted">{formatLatency(round.latencyMs)}</span>
        <span className="text-text-muted">
          {formatTokens(round.response.usage.inputTokens)}↓ {formatTokens(round.response.usage.outputTokens)}↑
          {(round.response.usage.cachedTokens ?? 0) > 0 && (
            <> ({formatTokens(round.response.usage.cachedTokens!)} cached)</>
          )}
        </span>
        <span className="text-text-muted">{formatCost(round.response.cost)}</span>
        <span className="ml-auto text-text-muted">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="space-y-2 px-3 pb-2 text-xs">
          <div>
            <span className="text-text-muted">Finish reason:</span>{' '}
            <span className="text-text-secondary">{round.response.finishReason}</span>
          </div>
          {round.response.content && (
            <div>
              <span className="text-text-muted">Response:</span>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-text-secondary">
                {round.response.content}
              </pre>
            </div>
          )}
          {round.toolExecutions.length > 0 && (
            <div>
              <span className="text-text-muted">Tools ({round.toolExecutions.length}):</span>
              <div className="mt-1 space-y-1">
                {round.toolExecutions.map(te => (
                  <div key={te.toolCallId} className="rounded bg-bg px-2 py-1">
                    <span className="text-accent">{te.toolName}</span>
                    <span className="ml-2 text-text-muted">{formatLatency(te.latencyMs)}</span>
                    {te.error && <span className="ml-2 text-error">Error</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TraceInspector({ trace, liveRounds }: TraceInspectorProps) {
  const rounds = trace?.rounds ?? liveRounds;
  const status = trace?.status ?? (liveRounds.length > 0 ? 'running' : null);

  if (!status) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-text-muted">Send a message to see trace data</p>
      </div>
    );
  }

  const totalTokens = rounds.reduce(
    (acc, r) => ({
      input: acc.input + r.response.usage.inputTokens,
      output: acc.output + r.response.usage.outputTokens,
      cached: acc.cached + (r.response.usage.cachedTokens ?? 0),
    }),
    { input: 0, output: 0, cached: 0 }
  );
  const totalCost = trace?.totalCost ?? rounds.reduce((acc, r) => acc + r.response.cost, 0);
  const cacheHitRate = totalTokens.input > 0 ? (totalTokens.cached / totalTokens.input) * 100 : 0;

  return (
    <div className="flex flex-col">
      {/* Summary */}
      <div className="border-b border-border p-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-text">Trace</h2>
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${
              status === 'completed'
                ? 'bg-success/20 text-success'
                : status === 'error'
                  ? 'bg-error/20 text-error'
                  : 'bg-warning/20 text-warning'
            }`}
          >
            {status}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-text-muted">Rounds:</span>{' '}
            <span className="text-text">{rounds.length}</span>
          </div>
          <div>
            <span className="text-text-muted">Cost:</span>{' '}
            <span className="text-text">{formatCost(totalCost)}</span>
          </div>
          <div>
            <span className="text-text-muted">Input:</span>{' '}
            <span className="text-text">{formatTokens(totalTokens.input)}</span>
          </div>
          <div>
            <span className="text-text-muted">Output:</span>{' '}
            <span className="text-text">{formatTokens(totalTokens.output)}</span>
          </div>
          {totalTokens.cached > 0 && (
            <>
              <div>
                <span className="text-text-muted">Cached:</span>{' '}
                <span className="text-text">{formatTokens(totalTokens.cached)}</span>
              </div>
              <div>
                <span className="text-text-muted">Cache hit:</span>{' '}
                <span className="text-text">{cacheHitRate.toFixed(0)}%</span>
              </div>
            </>
          )}
        </div>
        {trace?.model && (
          <div className="mt-1 text-xs text-text-muted">Model: {trace.model}</div>
        )}
      </div>

      {/* Timeline */}
      {rounds.length > 0 && (
        <div className="border-b border-border p-3">
          <TraceTimeline rounds={rounds} />
        </div>
      )}

      {/* Round list */}
      <div className="flex-1 overflow-y-auto">
        {rounds.map(round => (
          <RoundDetail key={round.index} round={round} />
        ))}
      </div>
    </div>
  );
}
