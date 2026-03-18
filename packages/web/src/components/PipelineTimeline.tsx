'use client';

import { useState } from 'react';
import type { AmygdalaClassification, RoutingDecision } from '@/lib/types';

export type PipelineStage = 'input' | 'amygdala' | 'router' | 'subagent';

type PipelineTimelineProps = {
  amygdala: AmygdalaClassification | null;
  routing: RoutingDecision | null;
  onStageSelect?: (stage: PipelineStage) => void;
};

const THREAT_THRESHOLD = 0.7;

export function PipelineTimeline({ amygdala, routing, onStageSelect }: PipelineTimelineProps) {
  const [activeStage, setActiveStage] = useState<PipelineStage | null>(null);

  const handleSelect = (stage: PipelineStage) => {
    setActiveStage(prev => (prev === stage ? null : stage));
    onStageSelect?.(stage);
  };

  const isHighThreat = amygdala != null && amygdala.threatScore >= THREAT_THRESHOLD;
  const isThreatOverride = routing?.threatOverride ?? false;

  return (
    <div className="flex items-center gap-1 text-xs">
      {/* --- Input stage --- */}
      <StageNode
        label="Input"
        active={activeStage === 'input'}
        onClick={() => handleSelect('input')}
      />

      <Arrow />

      {/* --- Amygdala stage --- */}
      <StageNode
        label="Amygdala"
        active={activeStage === 'amygdala'}
        alert={isHighThreat}
        subtitle={amygdala?.latencyMs != null ? `${amygdala.latencyMs}ms` : undefined}
        onClick={() => handleSelect('amygdala')}
        disabled={amygdala == null}
      />

      <Arrow />

      {/* --- Router stage --- */}
      <StageNode
        label="Router"
        active={activeStage === 'router'}
        alert={isThreatOverride}
        onClick={() => handleSelect('router')}
        disabled={routing == null}
      />

      <Arrow />

      {/* --- Subagent stage --- */}
      <StageNode
        label={routing?.subagentName ?? 'Subagent'}
        active={activeStage === 'subagent'}
        onClick={() => handleSelect('subagent')}
        disabled={routing == null}
      />
    </div>
  );
}

/* ── Internal components ──────────────────────────────────────────── */

type StageNodeProps = {
  label: string;
  active: boolean;
  alert?: boolean;
  subtitle?: string;
  disabled?: boolean;
  onClick: () => void;
};

function StageNode({ label, active, alert, subtitle, disabled, onClick }: StageNodeProps) {
  const base =
    'relative flex flex-col items-center gap-0.5 rounded-full px-3 py-1 transition-all select-none';
  const interactable = disabled
    ? 'opacity-40 cursor-default'
    : 'cursor-pointer hover:bg-bg-hover';

  // Border / glow styling
  let ring = 'ring-1 ring-border-subtle';
  if (active && alert) {
    ring = 'ring-2 ring-error shadow-[0_0_6px_var(--color-error)]';
  } else if (alert) {
    ring = 'ring-1 ring-error/70 shadow-[0_0_4px_var(--color-error)]';
  } else if (active) {
    ring = 'ring-2 ring-accent';
  }

  const textColor = alert ? 'text-error' : active ? 'text-accent' : 'text-text-secondary';

  return (
    <button
      type="button"
      className={`${base} ${interactable} ${ring} bg-bg-surface`}
      onClick={disabled ? undefined : onClick}
      aria-pressed={active}
      aria-disabled={disabled}
    >
      <span className={`whitespace-nowrap text-[11px] font-medium leading-none ${textColor}`}>
        {label}
      </span>
      {subtitle && (
        <span className="text-[9px] leading-none text-text-muted">{subtitle}</span>
      )}
    </button>
  );
}

function Arrow() {
  return (
    <svg
      className="h-3 w-4 shrink-0 text-border"
      viewBox="0 0 16 12"
      fill="none"
      aria-hidden="true"
    >
      <path d="M0 6h12m0 0L8 2m4 4L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
