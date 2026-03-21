/**
 * Generalization encounters for tournament evaluation.
 *
 * These encounters test skills NOT present in the roguelike training set.
 * Agents evolved to handle E1-E4 should generalize; if they don't, the
 * evolution overfit to the training encounters.
 */

import type { EncounterConfig } from '../types';

// ---------------------------------------------------------------------------
// E5: The Monitoring Gap — diagnose without direct service access
// ---------------------------------------------------------------------------

export const e5: EncounterConfig = {
  id: 'e5',
  name: 'The Monitoring Gap',
  setup: () => ({
    files: new Map([
      ['monitoring/alerts/active.json', JSON.stringify([
        { id: 'ALT-001', service: 'checkout', severity: 'critical', metric: 'error_rate', value: 0.45, threshold: 0.05, since: '2026-03-20T14:00:00Z' },
        { id: 'ALT-002', service: 'checkout', severity: 'warning', metric: 'p99_latency_ms', value: 8500, threshold: 2000, since: '2026-03-20T13:55:00Z' },
        { id: 'ALT-003', service: 'cdn', severity: 'info', metric: 'cache_miss_rate', value: 0.35, threshold: 0.20, since: '2026-03-20T13:50:00Z' },
      ], null, 2)],
      ['monitoring/metrics/checkout-timeseries.json', JSON.stringify({
        timestamps: ['13:00', '13:15', '13:30', '13:45', '14:00', '14:15'],
        error_rate: [0.01, 0.01, 0.02, 0.08, 0.25, 0.45],
        p99_latency_ms: [800, 850, 1200, 3500, 6000, 8500],
        requests_per_min: [1200, 1180, 1100, 900, 600, 400],
      })],
      ['monitoring/metrics/cdn-timeseries.json', JSON.stringify({
        timestamps: ['13:00', '13:15', '13:30', '13:45', '14:00', '14:15'],
        cache_miss_rate: [0.05, 0.05, 0.12, 0.20, 0.30, 0.35],
        bandwidth_gbps: [2.1, 2.0, 2.8, 4.5, 6.2, 7.1],
      })],
      ['monitoring/runbooks/checkout-high-error-rate.md', [
        '## Runbook: Checkout High Error Rate',
        '',
        '1. Check if upstream payment provider is responding',
        '2. Check database connection pool utilization',
        '3. Check if CDN is serving stale assets (can cause client-side errors)',
        '4. Check recent deployments',
        '',
        'Common root cause: CDN cache invalidation causes asset version mismatch,',
        'leading to client-side JavaScript errors that manifest as checkout failures.',
      ].join('\n')],
      ['deploy/recent.json', JSON.stringify([
        { service: 'checkout-frontend', version: '4.2.1', timestamp: '2026-03-20T13:30:00Z', deployer: 'ci-pipeline' },
        { service: 'cdn-config', version: '1.0.3', timestamp: '2026-03-20T13:45:00Z', deployer: 'ops-team', note: 'Updated cache rules for new asset paths' },
      ], null, 2)],
    ]),
    services: new Map([
      ['checkout', {
        status: 'degraded',
        config: { frontend_version: '4.2.1', cdn_endpoint: 'cdn.example.com/v4' },
        metrics: { error_rate: 0.45, p99_latency_ms: 8500, active_connections: 200 },
        logs: ['Client error: Cannot load module /assets/v4/checkout.js', 'Fallback to inline rendering'],
      }],
      ['cdn', {
        status: 'running',
        config: { cache_rules: 'v1.0.3', origin: 'storage.example.com' },
        metrics: { cache_miss_rate: 0.35, bandwidth_gbps: 7.1 },
        logs: ['Cache MISS /assets/v4/checkout.js', 'Serving from origin'],
      }],
      ['payment-provider', {
        status: 'running',
        config: { endpoint: 'api.payments.example.com' },
        metrics: { response_time_ms: 150, error_rate: 0.001 },
        logs: ['Healthy'],
      }],
    ]),
    incidentDb: [],
    dependencyGraph: {
      'checkout': ['cdn', 'payment-provider', 'database'],
      'cdn': ['storage'],
    },
    commandLog: [],
  }),
  getPrompt: () => [
    'ON-CALL ALERT: checkout service error rate at 45% (threshold: 5%).',
    'You only have access to monitoring dashboards, metrics, alerts, and runbooks.',
    'You cannot SSH into services or access their internal state directly.',
    '',
    'Your goal: identify the root cause from monitoring data and issue the correct',
    'remediation command. Read the runbook, correlate the timelines, and act.',
  ].join('\n'),
  evaluate: (sandbox) => {
    const commands = sandbox.commandLog;
    // Root cause: CDN config update at 13:45 broke cache for new frontend assets
    const fixedCdn = commands.some(c =>
      (c.includes('invalidate') || c.includes('purge')) && c.includes('cdn'),
    );
    const rolledBackCdn = commands.some(c =>
      c.includes('rollback') && (c.includes('cdn') || c.includes('cache')),
    );
    const redeployedFrontend = commands.some(c =>
      c.includes('deploy') && c.includes('checkout'),
    );

    if (fixedCdn || rolledBackCdn) {
      return { resolved: true, partial: false, score: 1.0, details: 'CDN cache issue identified and fixed.' };
    }
    if (redeployedFrontend) {
      return { resolved: false, partial: true, score: 0.4, details: 'Redeployed frontend but root cause (CDN cache) not addressed.' };
    }
    return { resolved: false, partial: false, score: 0.0, details: 'Root cause not identified.' };
  },
};

// ---------------------------------------------------------------------------
// E6: The Capacity Planning — proactive, not reactive
// ---------------------------------------------------------------------------

export const e6: EncounterConfig = {
  id: 'e6',
  name: 'The Capacity Planning',
  setup: () => ({
    files: new Map([
      ['capacity/current-usage.json', JSON.stringify({
        api_servers: { current: 6, max: 8, cpu_avg: 0.72, cpu_peak: 0.91 },
        database: { connections_used: 85, connections_max: 100, disk_used_gb: 180, disk_total_gb: 200, growth_rate_gb_per_day: 2.5 },
        cache: { memory_used_gb: 7.2, memory_total_gb: 8, hit_rate: 0.92, eviction_rate: 150 },
        queue: { depth: 2500, consumers: 4, processing_rate: 100, arrival_rate: 120 },
      }, null, 2)],
      ['capacity/traffic-forecast.json', JSON.stringify({
        current_rps: 500,
        forecast: [
          { date: '2026-03-25', event: 'product launch', estimated_multiplier: 3.0 },
          { date: '2026-04-01', event: 'quarter end', estimated_multiplier: 1.5 },
        ],
      })],
      ['capacity/cost-constraints.md', [
        '## Budget Constraints',
        '- Current monthly: $2,400',
        '- Maximum budget: $4,000/mo',
        '- Scaling costs: $200/server, $50/10GB disk, $100/consumer',
      ].join('\n')],
      ['capacity/sla.md', [
        '## SLA Requirements',
        '- API p99 latency: < 500ms',
        '- Queue processing lag: < 30s',
        '- Database disk: never exceed 90% utilization',
        '- Cache hit rate: > 85%',
      ].join('\n')],
    ]),
    services: new Map([
      ['api', {
        status: 'running',
        config: { servers: '6', max_servers: '8' },
        metrics: { rps: 500, p99_ms: 320, cpu_avg: 0.72 },
        logs: ['Operating normally'],
      }],
      ['database', {
        status: 'running',
        config: { max_connections: '100', disk_gb: '200' },
        metrics: { connections: 85, disk_used_pct: 0.90, growth_gb_day: 2.5 },
        logs: ['Disk usage approaching threshold'],
      }],
    ]),
    incidentDb: [],
    dependencyGraph: {
      'api': ['database', 'cache', 'queue'],
    },
    commandLog: [],
  }),
  getPrompt: () => [
    'CAPACITY REVIEW: A product launch in 5 days is expected to 3x traffic.',
    'Current systems are already running warm. Review the capacity data and produce',
    'a scaling plan that:',
    '  1. Handles the 3x traffic spike',
    '  2. Stays within the $4,000/mo budget',
    '  3. Addresses the database disk growth (8 days until 90% SLA breach)',
    '  4. Fixes the queue backlog (arrival rate > processing rate)',
    '',
    'Your goal: issue the specific scaling commands and config changes needed.',
    'Show your math for the capacity calculations.',
  ].join('\n'),
  evaluate: (sandbox) => {
    const commands = sandbox.commandLog;
    let score = 0;

    // Check: scaled API servers (need 3x → need ~18 servers, max 8... need to increase max or optimize)
    const scaledApi = commands.some(c => c.includes('scale') && c.includes('api'));
    if (scaledApi) score += 0.25;

    // Check: added disk or cleaned up database
    const addressedDisk = commands.some(c =>
      (c.includes('disk') || c.includes('storage') || c.includes('archive') || c.includes('partition')) &&
      (c.includes('database') || c.includes('db')),
    );
    if (addressedDisk) score += 0.25;

    // Check: addressed queue backlog (add consumers)
    const addressedQueue = commands.some(c =>
      (c.includes('consumer') || c.includes('queue') || c.includes('worker')) &&
      (c.includes('scale') || c.includes('add') || c.includes('increase')),
    );
    if (addressedQueue) score += 0.25;

    // Check: mentioned or addressed cache
    const addressedCache = commands.some(c =>
      c.includes('cache') && (c.includes('scale') || c.includes('increase') || c.includes('upgrade')),
    );
    if (addressedCache) score += 0.25;

    return {
      resolved: score >= 0.75,
      partial: score > 0 && score < 0.75,
      score,
      details: `Addressed ${Math.round(score * 4)}/4 capacity concerns.`,
    };
  },
};

export const GENERALIZATION_ENCOUNTERS: EncounterConfig[] = [e5, e6];
