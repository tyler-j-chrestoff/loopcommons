'use client';

import { useState } from 'react';
import type { EncounterTraceMeta, EncounterTraceStep } from '@/lib/tournament-loader';
import { TOOL_COLORS } from '@/lib/arena-types';

type EncounterReplayProps = {
  meta: EncounterTraceMeta;
  steps: EncounterTraceStep[];
};

export function EncounterReplay({ meta, steps }: EncounterReplayProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {/* Encounter context header */}
      <div className="flex items-center justify-between rounded-lg bg-bg-surface p-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold font-mono">{meta.encounterId.toUpperCase()}</span>
          <span className={`text-xs font-mono font-medium ${meta.resolved ? 'text-green-600' : 'text-red-600'}`}>
            {meta.score}
          </span>
        </div>
        <span className="text-xs text-text-secondary">{meta.details}</span>
      </div>

      {/* Step timeline */}
      {steps.length === 0 ? (
        <div className="text-xs text-text-muted text-center py-4">No steps recorded</div>
      ) : (
        <div className="flex flex-col gap-1">
          {steps.map((step, i) => {
            const isExpanded = expandedStep === i;
            const toolColor = TOOL_COLORS[step.toolName] ?? 'text-text-primary';
            return (
              <div key={i} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => setExpandedStep(isExpanded ? null : i)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-bg-surface transition-colors text-left"
                >
                  <span className="text-xs text-text-muted w-4 font-mono">{step.stepIndex}</span>
                  <span className={`text-xs font-medium ${toolColor}`}>{step.toolName}</span>
                  <span className="text-xs text-text-muted ml-auto">{step.durationMs}ms</span>
                </button>
                {isExpanded && (
                  <div className="ml-6 px-3 py-2 rounded-lg bg-bg-surface text-xs space-y-1 mb-1">
                    <div className="text-text-secondary">
                      <span className="font-medium text-text-primary">Input:</span>{' '}
                      {JSON.stringify(step.toolInput)}
                    </div>
                    <div className="text-text-secondary whitespace-pre-wrap">
                      <span className="font-medium text-text-primary">Output:</span>{' '}
                      {step.toolOutput}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Death marker */}
      {meta.died && meta.deathCause && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
          <span className="text-red-600 text-sm">💀</span>
          <div className="text-xs space-y-0.5">
            <div className="font-medium text-red-700">{meta.deathCause}</div>
            {meta.deathDetails && (
              <div className="text-red-600">{meta.deathDetails}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
