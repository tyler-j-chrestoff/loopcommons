'use client';

import { useEffect, useState } from 'react';

// --- Types matching the actual /api/metrics response ---

type AccuracyMetrics = {
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  true_negatives: number;
  total: number;
  precision: number | null;
  recall: number | null;
  f1_score: number | null;
  false_positive_rate: number | null;
  avg_threat_score: number | null;
  avg_threat_score_attacks: number | null;
  avg_threat_score_benign: number | null;
};

type RegimeMetrics = {
  total_sessions: number;
  attack_sessions: number;
  benign_sessions: number;
  refused_sessions: number;
  attack_rate: number;
  regime: string;
  mean_threat_score: number | null;
  median_threat_score: number | null;
  intent_conversation: number;
  intent_resume: number;
  intent_project: number;
  intent_adversarial: number;
  intent_security: number;
  intent_meta: number;
};

type MetricsResponse = {
  accuracy: AccuracyMetrics | null;
  regime: RegimeMetrics | null;
};

// --- Utility ---

function metricColor(value: number | null, thresholds: { good: number; warn: number }): string {
  if (value === null) return 'text-text-muted';
  if (value >= thresholds.good) return 'text-success';
  if (value >= thresholds.warn) return 'text-warning';
  return 'text-error';
}

function fprColor(value: number | null): string {
  if (value === null) return 'text-text-muted';
  if (value <= 0.05) return 'text-success';
  if (value <= 0.15) return 'text-warning';
  return 'text-error';
}

function regimeColor(regime: string): string {
  switch (regime) {
    case 'dormant': return 'bg-success/20 text-success';
    case 'vigilant': return 'bg-warning/20 text-warning';
    case 'active_defense': return 'bg-warning/30 text-warning';
    case 'overwhelmed': return 'bg-error/20 text-error';
    default: return 'bg-bg-elevated text-text-muted';
  }
}

function GaugeBar({ value, color }: { value: number; color: string }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="relative h-1.5 w-full rounded-full bg-bg-elevated">
      <div
        className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// --- Sub-components ---

function MetricRow({
  label,
  value,
  colorClass,
  description,
  gaugeColor,
}: {
  label: string;
  value: number | null;
  colorClass: string;
  description: string;
  gaugeColor: string;
}) {
  const display = value !== null ? `${(value * 100).toFixed(1)}%` : '--';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">{label}</span>
        <span className={`font-mono text-xs font-medium ${colorClass}`}>{display}</span>
      </div>
      <GaugeBar value={value ?? 0} color={gaugeColor} />
      <p className="text-[10px] text-text-muted">{description}</p>
    </div>
  );
}

function ConfusionMatrix({ acc }: { acc: AccuracyMetrics }) {
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md bg-border text-center text-xs">
      <div className="bg-bg-surface p-2" />
      <div className="bg-bg-surface p-2 font-medium text-text-muted">Actual Attack</div>
      <div className="bg-bg-surface p-2 font-medium text-text-muted">Actual Benign</div>
      <div className="bg-bg-surface p-2 font-medium text-text-muted">Predicted Attack</div>
      <div className="bg-success/10 p-2 font-mono text-success">{acc.true_positives}</div>
      <div className="bg-warning/10 p-2 font-mono text-warning">{acc.false_positives}</div>
      <div className="bg-bg-surface p-2 font-medium text-text-muted">Predicted Benign</div>
      <div className="bg-error/10 p-2 font-mono text-error">{acc.false_negatives}</div>
      <div className="bg-success/10 p-2 font-mono text-success">{acc.true_negatives}</div>
    </div>
  );
}

function IntentDistribution({ regime }: { regime: RegimeMetrics }) {
  const intents = [
    { label: 'Conversation', count: regime.intent_conversation, color: 'bg-blue-400' },
    { label: 'Resume', count: regime.intent_resume, color: 'bg-cyan-400' },
    { label: 'Project', count: regime.intent_project, color: 'bg-teal-400' },
    { label: 'Adversarial', count: regime.intent_adversarial, color: 'bg-red-400' },
    { label: 'Security', count: regime.intent_security, color: 'bg-orange-400' },
    { label: 'Meta', count: regime.intent_meta, color: 'bg-purple-400' },
  ].filter(i => i.count > 0);

  const total = intents.reduce((s, i) => s + i.count, 0);
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex h-4 w-full overflow-hidden rounded-full">
        {intents.map(i => (
          <div
            key={i.label}
            className={`${i.color} transition-all`}
            style={{ width: `${(i.count / total) * 100}%` }}
            title={`${i.label}: ${i.count}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {intents.map(i => (
          <span key={i.label} className="flex items-center gap-1 text-[10px] text-text-muted">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${i.color}`} />
            {i.label} ({i.count})
          </span>
        ))}
      </div>
    </div>
  );
}

// --- Main component ---

export function ComparisonMode() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchMetrics() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/metrics');
        if (!res.ok) throw new Error(`Metrics API returned ${res.status}`);
        const data = await res.json();
        if (!cancelled) setMetrics(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load metrics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMetrics();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Pipeline Metrics</h2>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-border border-t-transparent" />
          Loading...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Pipeline Metrics</h2>
        <div className="rounded border border-error/20 bg-error/5 px-3 py-2 text-xs text-error">
          {error}
        </div>
        <p className="text-[10px] text-text-muted">
          Run the Dagster pipeline to populate metrics from session data.
        </p>
      </div>
    );
  }

  const { accuracy: acc, regime } = metrics ?? {};

  if (!acc && !regime) {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Pipeline Metrics</h2>
        <p className="text-xs text-text-muted">No metrics yet. Run the data pipeline to generate.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-lg border border-border bg-bg-surface p-4">
      {/* Header + regime badge */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Pipeline Metrics</h2>
        {regime && (
          <span className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${regimeColor(regime.regime)}`}>
            {regime.regime.replace('_', ' ')}
          </span>
        )}
      </div>

      {/* Confusion matrix */}
      {acc && (
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-text-muted">Confusion Matrix</h3>
          <ConfusionMatrix acc={acc} />
        </section>
      )}

      {/* Key metrics */}
      {acc && (
        <section className="space-y-3">
          <h3 className="text-xs font-medium text-text-muted">Detection Performance</h3>
          <MetricRow
            label="Precision"
            value={acc.precision}
            colorClass={metricColor(acc.precision, { good: 0.9, warn: 0.7 })}
            gaugeColor="bg-emerald-400"
            description="Of flagged attacks, how many were real"
          />
          <MetricRow
            label="Recall"
            value={acc.recall}
            colorClass={metricColor(acc.recall, { good: 0.9, warn: 0.7 })}
            gaugeColor="bg-blue-400"
            description="Of all real attacks, how many were caught"
          />
          <MetricRow
            label="F1 Score"
            value={acc.f1_score}
            colorClass={metricColor(acc.f1_score, { good: 0.85, warn: 0.65 })}
            gaugeColor="bg-purple-400"
            description="Harmonic mean of precision and recall"
          />
          <MetricRow
            label="False Positive Rate"
            value={acc.false_positive_rate}
            colorClass={fprColor(acc.false_positive_rate)}
            gaugeColor="bg-amber-400"
            description="Benign inputs incorrectly flagged (lower is better)"
          />
        </section>
      )}

      {/* Threat score calibration */}
      {acc && acc.avg_threat_score_attacks !== null && (
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-text-muted">Threat Score Calibration</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border border-border bg-bg-surface px-3 py-2">
              <div className="text-[10px] text-text-muted">Avg (attacks)</div>
              <div className="font-mono text-sm text-error">
                {acc.avg_threat_score_attacks?.toFixed(2) ?? '--'}
              </div>
            </div>
            <div className="rounded border border-border bg-bg-surface px-3 py-2">
              <div className="text-[10px] text-text-muted">Avg (benign)</div>
              <div className="font-mono text-sm text-success">
                {acc.avg_threat_score_benign?.toFixed(2) ?? '--'}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Intent distribution */}
      {regime && (
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-text-muted">
            Intent Distribution ({regime.total_sessions} sessions)
          </h3>
          <IntentDistribution regime={regime} />
        </section>
      )}

      {/* Pipeline vs baseline comparison */}
      {acc && (
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-text-muted">Pipeline vs No-Amygdala Baseline</h3>
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-bg-surface">
                  <th className="px-3 py-1.5 text-left font-medium text-text-muted">Metric</th>
                  <th className="px-3 py-1.5 text-right font-medium text-accent">Pipeline</th>
                  <th className="px-3 py-1.5 text-right font-medium text-text-muted">Baseline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                <tr>
                  <td className="px-3 py-1.5 text-text-secondary">Attacks blocked</td>
                  <td className="px-3 py-1.5 text-right font-mono text-success">{acc.true_positives}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-text-muted">0</td>
                </tr>
                <tr>
                  <td className="px-3 py-1.5 text-text-secondary">Attacks missed</td>
                  <td className="px-3 py-1.5 text-right font-mono text-error">{acc.false_negatives}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-error">{acc.true_positives + acc.false_negatives}</td>
                </tr>
                <tr>
                  <td className="px-3 py-1.5 text-text-secondary">False alarms</td>
                  <td className="px-3 py-1.5 text-right font-mono text-warning">{acc.false_positives}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-text-muted">0</td>
                </tr>
                <tr>
                  <td className="px-3 py-1.5 text-text-secondary">Total evaluated</td>
                  <td className="px-3 py-1.5 text-right font-mono text-text-secondary">{acc.total}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-text-muted">{acc.total}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
