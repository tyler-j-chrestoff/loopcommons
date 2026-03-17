'use client';

import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '@/lib/types';
import { formatCost, formatTokens } from '@/lib/format';

type CostDashboardProps = {
  messages: ChatMessage[];
};

export function CostDashboard({ messages }: CostDashboardProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    if (popoverOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [popoverOpen]);

  const assistantMessages = messages.filter(m => m.role === 'assistant' && m.trace);
  const totalCost = assistantMessages.reduce((sum, m) => sum + (m.cost ?? 0), 0);
  const totalInput = assistantMessages.reduce(
    (sum, m) => sum + (m.trace?.totalUsage.inputTokens ?? 0),
    0
  );
  const totalOutput = assistantMessages.reduce(
    (sum, m) => sum + (m.trace?.totalUsage.outputTokens ?? 0),
    0
  );
  const model = assistantMessages.at(-1)?.trace?.model;

  return (
    <div className="relative flex items-center gap-3 text-xs" ref={popoverRef}>
      {model && <span className="text-text-muted">{model}</span>}
      <button
        onClick={() => setPopoverOpen(!popoverOpen)}
        className="flex items-center gap-2 rounded px-2 py-1 hover:bg-bg-hover"
      >
        <span className="text-text-secondary">{formatTokens(totalInput + totalOutput)} tok</span>
        <span className="text-accent">{formatCost(totalCost)}</span>
      </button>

      {popoverOpen && assistantMessages.length > 0 && (
        <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-lg border border-border bg-bg-elevated p-3 shadow-lg">
          <h3 className="mb-2 text-xs font-medium text-text">Cost Breakdown</h3>
          <div className="space-y-1.5">
            {assistantMessages.map((msg, i) => (
              <div key={msg.id} className="flex items-center justify-between text-xs">
                <span className="text-text-muted">Message {i + 1}</span>
                <div className="flex gap-2">
                  <span className="text-text-secondary">
                    {formatTokens(
                      (msg.trace?.totalUsage.inputTokens ?? 0) +
                        (msg.trace?.totalUsage.outputTokens ?? 0)
                    )}
                  </span>
                  <span className="text-accent">{formatCost(msg.cost ?? 0)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-border pt-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-text">Total</span>
              <div className="flex gap-2">
                <span className="text-text-secondary">{formatTokens(totalInput + totalOutput)}</span>
                <span className="text-accent">{formatCost(totalCost)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
