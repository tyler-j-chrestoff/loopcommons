'use client';

import type { ChoicePointEvent } from '@/lib/arena-types';
import { TOOL_COLORS } from '@/lib/arena-types';

type ChoicePointEntry = {
  pathId: string;
  choicePoint: ChoicePointEvent;
};

type ChoicePointInspectorProps = {
  choicePoints: ChoicePointEntry[];
};

export function ChoicePointInspector({ choicePoints }: ChoicePointInspectorProps) {
  if (choicePoints.length === 0) return null;

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(choicePoints.length, 3)}, 1fr)` }}>
      {choicePoints.map(({ pathId, choicePoint: cp }) => (
        <ChoiceCard key={pathId} pathId={pathId} cp={cp} />
      ))}
    </div>
  );
}

function ChoiceCard({ pathId, cp }: { pathId: string; cp: ChoicePointEvent }) {
  const confColor =
    cp.confidenceScore >= 0.7 ? 'text-green-600' :
    cp.confidenceScore >= 0.4 ? 'text-yellow-600' :
    'text-red-600';

  return (
    <div className="rounded-lg bg-bg-surface p-3 text-xs space-y-2 ring-1 ring-border-subtle">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-medium text-text-primary">{pathId}</span>
        <span className={`font-mono font-medium ${confColor}`}>
          {cp.confidenceScore.toFixed(2)}
        </span>
      </div>

      {/* Current tools */}
      <div className="flex items-center gap-1">
        <span className="text-text-muted">Has:</span>
        {cp.currentTools.length > 0 ? (
          cp.currentTools.map(t => (
            <span key={t} className={`font-mono ${TOOL_COLORS[t] ?? ''}`}>{t}</span>
          ))
        ) : (
          <span className="text-text-muted italic">none</span>
        )}
      </div>

      {/* Decision */}
      <div className="flex items-center gap-1">
        <span className="text-text-muted">Chose:</span>
        <span className={`font-mono font-medium ${TOOL_COLORS[cp.selectedTool] ?? ''}`}>
          {cp.selectedTool}
        </span>
        {cp.droppedTool && (
          <>
            <span className="text-text-muted">dropped:</span>
            <span className="font-mono text-red-500">{cp.droppedTool}</span>
          </>
        )}
      </div>

      {/* Reasoning sections */}
      <div className="space-y-1.5 text-text-secondary border-t border-border-subtle pt-2">
        <ReasoningSection label="Self-assessment" text={cp.selfAssessment} />
        <ReasoningSection label="Reasoning" text={cp.acquisitionReasoning} />
        {cp.sacrificeReasoning && (
          <ReasoningSection label="Sacrifice" text={cp.sacrificeReasoning} />
        )}
        <ReasoningSection label="Forward model" text={cp.forwardModel} />
      </div>

      {/* State hash */}
      <div className="font-mono text-[10px] text-text-muted pt-1">
        {cp.stateHash.slice(0, 8)}
      </div>
    </div>
  );
}

function ReasoningSection({ label, text }: { label: string; text: string }) {
  return (
    <p>
      <span className="font-medium text-text-primary">{label}:</span>{' '}
      {text}
    </p>
  );
}
