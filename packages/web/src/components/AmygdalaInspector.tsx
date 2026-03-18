'use client';

import { useState } from 'react';
import type { AmygdalaClassification, RoutingDecision } from '@/lib/types';
import { PipelineTimeline, type PipelineStage } from './PipelineTimeline';
import { AmygdalaPassCard } from './AmygdalaPassCard';
import { RoutingCard } from './RoutingCard';

type AmygdalaInspectorProps = {
  amygdala: AmygdalaClassification | null;
  routing: RoutingDecision | null;
  sessionId: string | null;
};

export function AmygdalaInspector({ amygdala, routing, sessionId }: AmygdalaInspectorProps) {
  const [activeStage, setActiveStage] = useState<PipelineStage | null>(null);

  if (!amygdala && !routing) {
    return (
      <div className="flex items-center justify-center p-4">
        <p className="text-sm text-text-muted">Send a message to see the amygdala pipeline</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      {/* Session ID badge */}
      {sessionId && (
        <div className="text-text-muted">
          Session: <span className="font-mono text-text-secondary">{sessionId}</span>
        </div>
      )}

      {/* Pipeline timeline — horizontal stage flow */}
      <PipelineTimeline
        amygdala={amygdala}
        routing={routing}
        onStageSelect={setActiveStage}
      />

      {/* Detail cards — shown based on timeline selection or all by default */}
      {(activeStage === null || activeStage === 'amygdala') && amygdala && (
        <AmygdalaPassCard
          pass={amygdala}
          label="Amygdala"
          defaultCollapsed={activeStage !== 'amygdala'}
        />
      )}

      {(activeStage === null || activeStage === 'router' || activeStage === 'subagent') && routing && (
        <RoutingCard routing={routing} />
      )}

      {/* Input stage — show the original prompt */}
      {activeStage === 'input' && amygdala?.originalPrompt && (
        <div className="rounded-md border border-border-subtle bg-bg-surface p-3">
          <p className="mb-1 text-text-muted">Raw Input</p>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-text-secondary">
            {amygdala.originalPrompt}
          </pre>
        </div>
      )}
    </div>
  );
}
