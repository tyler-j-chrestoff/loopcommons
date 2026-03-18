'use client';

import { useState } from 'react';
import type { AmygdalaClassification } from '@/lib/types';

// --- Utility functions (extracted for reuse) ---

/** Threat score to text color class */
function threatColor(score: number): string {
  if (score >= 0.7) return 'text-error';
  if (score >= 0.4) return 'text-warning';
  return 'text-success';
}

/** Threat score to gauge fill background */
function threatBgColor(score: number): string {
  if (score >= 0.7) return 'bg-error';
  if (score >= 0.4) return 'bg-warning';
  return 'bg-success';
}

/** Confidence value to human-readable label */
function confidenceLabel(c: number): string {
  if (c >= 0.9) return 'very high';
  if (c >= 0.7) return 'high';
  if (c >= 0.5) return 'moderate';
  if (c >= 0.3) return 'low';
  return 'very low';
}

// --- Sub-components ---

/** Horizontal gauge bar for 0-1 values */
function GaugeBar({ value, color }: { value: number; color: string }) {
  const clamped = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="relative h-1.5 w-full rounded-full bg-border">
      <div
        className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** Expandable section with toggle chevron */
function CollapsibleSection({
  label,
  labelClass,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  labelClass?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border-subtle">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-bg-hover"
      >
        <span className={`font-medium ${labelClass ?? 'text-text'}`}>{label}</span>
        <span className="ml-auto text-text-muted">{expanded ? '\u25BC' : '\u25B6'}</span>
      </button>
      {expanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

// --- Main component ---

type AmygdalaPassCardProps = {
  pass: AmygdalaClassification;
  /** Optional label shown in the header (e.g. "Pass 1") */
  label?: string;
  /** Start collapsed (default: true) */
  defaultCollapsed?: boolean;
};

export function AmygdalaPassCard({
  pass,
  label,
  defaultCollapsed = false,
}: AmygdalaPassCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [expandedSection, setExpandedSection] = useState<'rewrite' | 'reasoning' | null>(null);

  const toggleSection = (section: 'rewrite' | 'reasoning') =>
    setExpandedSection(prev => (prev === section ? null : section));

  // --- Header (always visible) ---
  const header = (
    <button
      onClick={() => setCollapsed(c => !c)}
      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-bg-hover"
    >
      {/* Collapse chevron */}
      <span className="text-text-muted">{collapsed ? '\u25B6' : '\u25BC'}</span>

      {/* Label */}
      {label && <span className="text-sm font-medium text-text">{label}</span>}

      {/* Intent badge */}
      <span className="rounded bg-accent/20 px-1.5 py-0.5 text-xs font-medium text-accent">
        {pass.intent}
      </span>

      {/* Threat score pill */}
      <span className={`ml-auto font-mono text-xs font-medium ${threatColor(pass.threatScore)}`}>
        {pass.threatScore.toFixed(2)}
      </span>

      {/* Rewrite indicator */}
      <span
        className={`text-xs font-medium ${pass.rewriteModified ? 'text-warning' : 'text-success'}`}
      >
        {pass.rewriteModified ? 'Rewritten' : 'Unchanged'}
      </span>

      {/* Latency */}
      {pass.latencyMs != null && (
        <span className="text-xs text-text-muted">{pass.latencyMs}ms</span>
      )}
    </button>
  );

  if (collapsed) {
    return (
      <div className="rounded-md border border-border-subtle bg-bg-surface text-xs">{header}</div>
    );
  }

  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface text-xs">
      {header}

      {/* --- Classification details --- */}
      <div className="space-y-2 border-t border-border-subtle px-3 py-2">
        {/* Intent + confidence */}
        <div className="flex items-center gap-2">
          <span className="text-text-muted">Intent</span>
          <span className="rounded bg-accent/20 px-1.5 py-0.5 font-medium text-accent">
            {pass.intent}
          </span>
          <span className="text-text-muted">
            {(pass.confidence * 100).toFixed(0)}% ({confidenceLabel(pass.confidence)})
          </span>
        </div>

        {/* Threat gauge */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-text-muted">Threat</span>
            <span className={`font-mono font-medium ${threatColor(pass.threatScore)}`}>
              {pass.threatScore.toFixed(2)}
            </span>
          </div>
          <div className="mt-1">
            <GaugeBar value={pass.threatScore} color={threatBgColor(pass.threatScore)} />
          </div>
          {pass.threatCategory !== 'none' && (
            <div className="mt-1 text-text-muted">
              Category: <span className="text-text-secondary">{pass.threatCategory}</span>
            </div>
          )}
        </div>
      </div>

      {/* --- Expandable: Rewrite diff --- */}
      <CollapsibleSection
        label={pass.rewriteModified ? 'Rewritten' : 'Unchanged'}
        labelClass={pass.rewriteModified ? 'text-warning' : 'text-success'}
        expanded={expandedSection === 'rewrite'}
        onToggle={() => toggleSection('rewrite')}
      >
        <div className="space-y-2">
          {pass.originalPrompt && (
            <div>
              <span className="text-text-muted">Original:</span>
              <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-bg px-2 py-1 text-text-secondary">
                {pass.originalPrompt}
              </pre>
            </div>
          )}
          {pass.rewrittenPrompt && pass.rewriteModified && (
            <div>
              <span className="text-text-muted">Rewritten:</span>
              <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-bg px-2 py-1 text-text-secondary">
                {pass.rewrittenPrompt}
              </pre>
            </div>
          )}
          {!pass.rewriteModified && (
            <p className="text-text-muted">Input was passed through without modification.</p>
          )}
        </div>
      </CollapsibleSection>

      {/* --- Expandable: Threat reasoning --- */}
      <CollapsibleSection
        label="Threat Reasoning"
        expanded={expandedSection === 'reasoning'}
        onToggle={() => toggleSection('reasoning')}
      >
        {pass.threatReasoning ? (
          <p className="whitespace-pre-wrap text-text-secondary">{pass.threatReasoning}</p>
        ) : (
          <p className="text-text-muted">No reasoning provided.</p>
        )}
      </CollapsibleSection>
    </div>
  );
}
