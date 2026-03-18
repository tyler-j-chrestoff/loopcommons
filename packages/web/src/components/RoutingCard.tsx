'use client';

import { useState } from 'react';
import type { RoutingDecision } from '@/lib/types';

type RoutingCardProps = {
  routing: RoutingDecision;
};

export function RoutingCard({ routing }: RoutingCardProps) {
  const [reasoningExpanded, setReasoningExpanded] = useState(false);

  const {
    subagentName,
    threatOverride,
    allowedTools,
    reasoning,
    totalMessages,
    delegatedMessages,
    deliveredMessages,
    usedSummary,
  } = routing;

  const filteredCount = delegatedMessages - deliveredMessages;

  return (
    <div className="rounded-lg border border-border bg-bg-surface text-xs">
      {/* Header: subagent badge + threat override */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <span className="rounded-full bg-accent/20 px-2.5 py-0.5 font-medium text-accent">
          {subagentName}
        </span>
        {threatOverride && (
          <span className="rounded-full bg-error/20 px-2.5 py-0.5 font-medium text-error">
            Threat Override
          </span>
        )}
      </div>

      {/* Tool allowlist */}
      <div className="border-b border-border-subtle px-3 py-2">
        <p className="mb-1.5 text-text-muted">Tools</p>
        {allowedTools.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {allowedTools.map((tool) => (
              <span
                key={tool}
                className="rounded bg-bg-hover px-1.5 py-0.5 font-mono text-text-secondary"
              >
                {tool}
              </span>
            ))}
          </div>
        ) : (
          <span className="italic text-text-muted">No tools</span>
        )}
      </div>

      {/* Context filtering stats */}
      <div className="border-b border-border-subtle px-3 py-2">
        <p className="mb-1.5 text-text-muted">Context Filtering</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-semibold text-text">{totalMessages}</p>
            <p className="text-text-muted">Total</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-text">{delegatedMessages}</p>
            <p className="text-text-muted">Delegated</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-text">{deliveredMessages}</p>
            <p className="text-text-muted">Delivered</p>
          </div>
        </div>
        {filteredCount > 0 && (
          <p className="mt-1.5 text-text-muted">
            <span className="text-warning">{filteredCount}</span> message{filteredCount !== 1 ? 's' : ''} withheld by context filter
          </p>
        )}
        {usedSummary && (
          <p className="mt-1 text-text-muted italic">
            Used compressed context summary
          </p>
        )}
      </div>

      {/* Expandable reasoning */}
      <div className="px-3 py-2">
        <button
          type="button"
          onClick={() => setReasoningExpanded((prev) => !prev)}
          className="flex w-full items-center gap-1 text-left text-text-secondary hover:text-text transition-colors"
        >
          <span
            className="inline-block transition-transform duration-200"
            style={{ transform: reasoningExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            ▸
          </span>
          <span>Routing Reasoning</span>
        </button>
        {reasoningExpanded && (
          <p className="mt-1.5 whitespace-pre-wrap text-text-secondary leading-relaxed">
            {reasoning}
          </p>
        )}
      </div>
    </div>
  );
}
