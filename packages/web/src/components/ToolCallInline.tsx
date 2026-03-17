'use client';

import { useState } from 'react';
import type { ToolExecution } from '@loopcommons/llm';
import { formatLatency } from '@/lib/format';

type ToolCallInlineProps = {
  execution: ToolExecution;
};

export function ToolCallInline({ execution }: ToolCallInlineProps) {
  const [expanded, setExpanded] = useState(false);
  const hasError = !!execution.error;

  return (
    <div className="mt-2 rounded border border-border bg-bg text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-hover"
      >
        <span className={`font-medium ${hasError ? 'text-error' : 'text-accent'}`}>
          {execution.toolName}
        </span>
        <span className="text-text-muted">{formatLatency(execution.latencyMs)}</span>
        <span className="ml-auto text-text-muted">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          <div>
            <span className="text-text-muted">Input:</span>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-text-secondary">
              {JSON.stringify(execution.input, null, 2)}
            </pre>
          </div>
          <div>
            <span className={hasError ? 'text-error' : 'text-text-muted'}>
              {hasError ? 'Error:' : 'Output:'}
            </span>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-text-secondary">
              {execution.output}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
