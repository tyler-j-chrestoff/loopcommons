/**
 * Brutal encounters for evolutionary tournament v2.
 *
 * Design philosophy: every encounter has a kill triangle —
 *   1. The Trap: a naive action that feels correct but is lethal
 *   2. The Gate: a hard requirement for specific tool synergy
 *   3. The Bleed: a time/resource drain that punishes slow agents
 *
 * No single tool can complete any encounter. Every 2-tool combination
 * is required by at least one. Wrong actions cause state corruption.
 */

import type { EncounterConfig } from './types';
import { computeSystemHealth } from './cascade-scoring';
import type { CouplingPoint } from './cascade-scoring';

// ---------------------------------------------------------------------------
// E7: The Hydra — Cascading Service Collapse
// Required: model + act. inspect helps. search irrelevant.
// Trap: blind restarts trigger geometric failure.
// ---------------------------------------------------------------------------

export const e7: EncounterConfig = {
  id: 'e7',
  name: 'The Hydra',
  setup: () => ({
    files: new Map([
      ['services/service-a/logs/app.log', [
        '2026-03-20T10:00:00Z ERROR: Connection refused: service-b:8080/health',
        '2026-03-20T10:00:05Z ERROR: Circuit breaker OPEN for service-b',
        '2026-03-20T10:00:10Z FATAL: CrashLoopBackOff — restarting in 30s',
      ].join('\n')],
      ['services/service-b/logs/app.log', [
        '2026-03-20T10:00:00Z ERROR: Cache miss cascade — service-c:6379 unreachable',
        '2026-03-20T10:00:02Z ERROR: Cannot rebuild cache: upstream data-source timeout',
        '2026-03-20T10:00:10Z FATAL: CrashLoopBackOff — restarting in 30s',
      ].join('\n')],
      ['services/service-c/logs/app.log', [
        '2026-03-20T10:00:00Z ERROR: Health check dependency failed: service-a:8080/ready',
        '2026-03-20T10:00:01Z WARN: Disabling cache writes (upstream unhealthy)',
        '2026-03-20T10:00:10Z FATAL: CrashLoopBackOff — restarting in 30s',
      ].join('\n')],
      ['services/cache-layer/logs/app.log', [
        '2026-03-20T09:55:00Z INFO: Cache layer running, no upstream dependencies in crash state',
        '2026-03-20T10:00:00Z WARN: Increased miss rate (upstream services unavailable)',
      ].join('\n')],
      ['services/message-queue/logs/app.log', [
        '2026-03-20T09:50:00Z INFO: Message queue started, consumers connected',
        '2026-03-20T10:00:00Z WARN: Consumer service-c lagging — backpressure increasing',
        '2026-03-20T10:00:05Z WARN: Dead-letter queue growing: 1200 messages',
      ].join('\n')],
      ['services/health-monitor/logs/app.log', [
        '2026-03-20T09:50:00Z INFO: Health monitor started, polling all endpoints',
        '2026-03-20T10:00:00Z WARN: service-a health check failing — marking degraded',
        '2026-03-20T10:00:02Z INFO: Notifying service-c of upstream degradation',
      ].join('\n')],
      ['ops/topology-notes.md', [
        '## Service Topology (apparent)',
        'service-a → service-b → message-queue → service-c → service-a (circular)',
        'Health monitoring and message routing add intermediate hops.',
        '',
        '## Recovery Note',
        'When crash-looping occurs, restarting any service in the cycle',
        'causes the others to attempt reconnection, increasing load.',
      ].join('\n')],
    ]),
    services: new Map([
      ['service-a', {
        status: 'degraded',
        config: { port: '8080', depends_on: 'service-b' },
        metrics: { crash_count: 12, uptime_s: 0 },
        logs: ['CrashLoopBackOff'],
      }],
      ['service-b', {
        status: 'degraded',
        config: { port: '8080', depends_on: 'cache-layer,service-c' },
        metrics: { crash_count: 8, uptime_s: 0 },
        logs: ['CrashLoopBackOff'],
      }],
      ['service-c', {
        status: 'degraded',
        config: { port: '6379', depends_on: 'service-a' },
        metrics: { crash_count: 10, uptime_s: 0 },
        logs: ['CrashLoopBackOff'],
      }],
      ['cache-layer', {
        status: 'running',
        config: { port: '6380', mode: 'standalone' },
        metrics: { hit_rate: 0.3, connections: 0, uptime_s: 14400 },
        logs: ['Running, no upstream dependencies in crash state'],
      }],
      ['message-queue', {
        status: 'running',
        config: { port: '5672', consumers: 'cache-layer,service-c' },
        metrics: { messages_in_flight: 1200, dead_letters: 1200, uptime_s: 14400 },
        logs: ['Consumer service-c lagging', 'Dead-letter queue growing'],
      }],
      ['health-monitor', {
        status: 'running',
        config: { poll_interval_s: '5', targets: 'service-a,service-b,service-c' },
        metrics: { checks_total: 8640, checks_failed: 120, uptime_s: 14400 },
        logs: ['service-a health check failing', 'Notifying service-c of upstream degradation'],
      }],
    ]),
    incidentDb: [
      {
        id: 'INC-HYDRA',
        title: 'Circular dependency crash-loop recovery',
        description: 'When service-a/b/c are in crash loop with circular deps, the ONLY safe restart target is the independent node. Restart command must include --break-cycle flag to suppress health-check cascade. Without this flag, restart triggers reconnection storm.',
        resolution: 'restart cache-layer --break-cycle',
        tags: ['crash-loop', 'circular-dependency', 'recovery'],
      },
    ],
    dependencyGraph: {
      'service-a': ['service-b'],
      'service-b': ['message-queue'],
      'message-queue': ['cache-layer', 'service-c'],
      'service-c': ['health-monitor'],
      'health-monitor': ['service-a'],
      'cache-layer': [],
    },
    commandLog: [],
  }),
  getPrompt: () => [
    'INCIDENT: Queue backpressure event caused 3 services to crash-loop.',
    'service-a, service-b, and service-c are all in CrashLoopBackOff.',
    'They have circular health-check dependencies.',
    '',
    'WARNING: Restarting services in the wrong order may cause further failures.',
    'Map the dependencies and find the safe restart point.',
  ].join('\n'),
  evaluate: (sandbox) => {
    const commands = sandbox.commandLog;

    // Count blind restarts of cycled services (not cache-layer)
    const blindRestarts = commands.filter(c =>
      c.includes('restart') &&
      (c.includes('service-a') || c.includes('service-b') || c.includes('service-c')),
    ).length;

    // Death: 5+ blind restarts = cluster death
    if (blindRestarts >= 5) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'Cluster death — geometric restart cascade.' };
    }

    // Correct: restart cache-layer (the only node with no upstream deps in crash state)
    const restartedCache = commands.some(c =>
      c.includes('restart') && c.includes('cache-layer'),
    );
    const usedBreakCycle = commands.some(c =>
      c.includes('cache-layer') && c.includes('--break-cycle'),
    );

    if (restartedCache && blindRestarts === 0) {
      const score = usedBreakCycle ? 1.0 : 0.6;
      const details = usedBreakCycle
        ? 'Restarted safe node (cache-layer) with --break-cycle, breaking the cycle.'
        : 'Restarted safe node (cache-layer) but without --break-cycle flag — reconnection storm risk.';
      return { resolved: true, partial: !usedBreakCycle, score, details };
    }

    if (restartedCache && blindRestarts > 0) {
      const base = usedBreakCycle ? 0.8 : 0.5;
      const penalty = blindRestarts * 0.15;
      const score = Math.max(0, base - penalty);
      return { resolved: score > 0, partial: true, score, details: `Restarted cache-layer but ${blindRestarts} unnecessary restarts.` };
    }

    // Blind restarts without finding the safe node
    if (blindRestarts > 0) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'Blind restarts without finding safe node — death by cascade.' };
    }

    return { resolved: false, partial: false, score: 0, dead: true, details: 'No remediation attempted.' };
  },
};

// ---------------------------------------------------------------------------
// E8: The Mimic — Lying Observability
// Required: inspect (hard gate). inspect + model optimal.
// Trap: dashboard says CPU 98%, but it's a sidecar miscount.
// ---------------------------------------------------------------------------

export const e8: EncounterConfig = {
  id: 'e8',
  name: 'The Mimic',
  setup: () => ({
    files: new Map([
      ['monitoring/dashboard.json', JSON.stringify({
        database_primary: {
          cpu_percent: 98,
          memory_percent: 72,
          disk_io_percent: 45,
          status: 'CRITICAL',
          alert: 'CPU_THRESHOLD_EXCEEDED',
        },
      }, null, 2)],
      ['monitoring/alerts/active.json', JSON.stringify([
        { id: 'ALT-100', service: 'database-primary', severity: 'critical', metric: 'cpu_percent', value: 98, threshold: 85 },
      ], null, 2)],
      ['host/proc/stat', [
        'cpu  1250 320 890 98200 120 0 45 0 0 0',
        '# Actual CPU usage: ~2.5% (idle 98200 / total 100825)',
        '# The sidecar metrics-agent miscounts cgroup CPU shares',
      ].join('\n')],
      ['host/proc/sidecar-metrics-agent.log', [
        '2026-03-20T08:00:00Z INFO: metrics-agent v2.1.0 started',
        '2026-03-20T08:00:01Z WARN: cgroup v2 CPU accounting mode — using shares, not usage',
        '2026-03-20T08:00:02Z INFO: Reporting CPU: shares_allocated/shares_total = 1000/1024 = 97.7%',
        '# BUG: reporting allocated shares, not actual utilization',
      ].join('\n')],
      ['ops/runbook-high-cpu.md', [
        '## Runbook: Database High CPU',
        '1. Check dashboard for CPU metric',
        '2. If CPU > 90%, scale up read replicas',
        '3. If CPU > 95%, trigger failover to standby',
      ].join('\n')],
    ]),
    services: new Map([
      ['database-primary', {
        status: 'running',
        config: { replicas: '1', mode: 'primary' },
        metrics: { queries_per_sec: 50, avg_query_ms: 3, connections: 12 },
        logs: ['Operating normally', 'Query performance nominal'],
      }],
      ['metrics-agent', {
        status: 'running',
        config: { version: '2.1.0', mode: 'cgroup-shares' },
        metrics: { reports_sent: 4800, uptime_hours: 4 },
        logs: ['Reporting CPU: shares_allocated/shares_total'],
      }],
    ]),
    incidentDb: [
      {
        id: 'INC-CGROUP',
        title: 'Sidecar metrics-agent cgroup CPU miscount',
        description: 'metrics-agent v2.x reports cgroup shares allocation as CPU utilization. Real usage in /proc/stat. Always cross-reference /proc/stat before acting on CPU alerts. Fix: restart metrics-agent --recalibrate',
        resolution: 'restart metrics-agent --recalibrate',
        tags: ['metrics', 'sidecar', 'cgroup', 'false-positive'],
      },
    ],
    dependencyGraph: {
      'database-primary': [],
      'metrics-agent': ['database-primary'],
      'api-gateway': ['database-primary'],
    },
    commandLog: [],
  }),
  getPrompt: () => [
    'ALERT: database-primary CPU at 98%. Critical threshold exceeded.',
    'The oncall runbook recommends scaling up replicas at >90% CPU.',
    '',
    'Diagnose and remediate. The database serves all production traffic.',
  ].join('\n'),
  evaluate: (sandbox) => {
    const commands = sandbox.commandLog;

    // Death: scaling up triggers leader migration
    const scaledUp = commands.some(c =>
      (c.includes('scale') || c.includes('replica') || c.includes('failover')) &&
      c.includes('database'),
    );
    if (scaledUp) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'Death — scaled up based on false metric, triggered leader migration outage.' };
    }

    // Correct: fix/restart the metrics agent (the actual problem)
    const fixedSidecar = commands.some(c =>
      (c.includes('restart') || c.includes('fix') || c.includes('reconfigure')) &&
      (c.includes('sidecar') || c.includes('metrics-agent') || c.includes('metrics_agent')),
    );
    const usedRecalibrate = commands.some(c =>
      c.includes('metrics-agent') && c.includes('--recalibrate'),
    );

    if (fixedSidecar && usedRecalibrate) {
      return { resolved: true, partial: false, score: 1.0, details: 'Identified false metric and fixed sidecar with --recalibrate.' };
    }
    if (fixedSidecar) {
      return { resolved: true, partial: true, score: 0.5, details: 'Identified false metric and restarted sidecar but without --recalibrate — may miscount again.' };
    }

    // Partial: agent recognized the lie but didn't fix it
    const noAction = commands.length === 0;
    if (noAction) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'No remediation attempted.' };
    }

    return { resolved: false, partial: false, score: 0, dead: true, details: 'Actions taken but sidecar not fixed.' };
  },
};

// ---------------------------------------------------------------------------
// E9: The Ritual — Exact Procedure Required
// Required: search + act. inspect helps confirm state.
// Trap: reasoning out a plausible-but-wrong rollback order kills.
// ---------------------------------------------------------------------------

export const e9: EncounterConfig = {
  id: 'e9',
  name: 'The Ritual',
  setup: () => ({
    files: new Map([
      ['database/migration-state.json', JSON.stringify({
        migration: 'v5_add_audit_trail',
        status: 'stuck',
        applied: ['create_table_audit_events', 'add_trigger_x_on_orders', 'add_constraint_y_fk_users'],
        pending: ['add_column_z_audit_hash', 'create_index_audit_events_ts'],
        error: 'Timeout during add_column_z_audit_hash — schema in partial state',
      }, null, 2)],
      ['database/schema-current.sql', [
        '-- Partially applied migration v5',
        'TABLE audit_events (id SERIAL, event_type TEXT, created_at TIMESTAMP);',
        'TRIGGER trigger_x ON orders AFTER INSERT → audit_events;',
        'CONSTRAINT constraint_y FOREIGN KEY (user_id) REFERENCES users(id);',
        '-- Column audit_hash NOT YET ADDED (migration stuck)',
      ].join('\n')],
      ['database/prod-inventory.json', JSON.stringify({
        databases: [
          { name: 'orders-primary', host: 'db-prod-01', role: 'primary' },
          { name: 'orders-replica', host: 'db-prod-02', role: 'replica' },
          { name: 'orders-staging', host: 'db-staging-01', role: 'staging' },
        ],
      }, null, 2)],
    ]),
    services: new Map([
      ['orders-api', {
        status: 'degraded',
        config: { database: 'orders-primary' },
        metrics: { error_rate: 0.35, p99_ms: 12000 },
        logs: ['Migration lock held', 'Queries timing out on audit_events'],
      }],
    ]),
    incidentDb: [
      {
        id: 'INC-089',
        title: 'v5 migration stuck — exact rollback procedure (DO NOT DEVIATE)',
        description: [
          'Migration v5_add_audit_trail stuck during add_column_z_audit_hash.',
          'The ONLY safe rollback order is:',
          '  1. drop trigger_x (has cascading FK dep on constraint_y)',
          '  2. drop constraint_y (once trigger is gone)',
          '  3. drop column_z if partially created',
          '  4. drop table audit_events',
          '  5. re-run migration with --skip-applied flag on orders-primary',
          '',
          'WARNING: Dropping constraint_y before trigger_x causes catalog corruption.',
          'WARNING: Dropping column_z before trigger_x causes dangling reference.',
          'CRITICAL: must specify target database explicitly: `--target orders-primary`. Running against default target applies to all databases.',
          'This was discovered through trial and error during INC-065.',
        ].join('\n'),
        resolution: 'Follow exact order: drop-trigger-x, drop-constraint-y, drop-column-z, drop-table, migrate --skip-applied',
        tags: ['migration', 'rollback', 'critical-procedure'],
      },
      {
        id: 'INC-065',
        title: 'Original discovery of v5 rollback sensitivity',
        description: 'Attempted logical rollback order (table → column → constraint → trigger). Caused catalog corruption requiring point-in-time recovery.',
        resolution: 'Recovered from backup. Documented correct order in INC-089.',
        tags: ['migration', 'catalog-corruption'],
      },
    ],
    dependencyGraph: {
      'orders-api': ['orders-primary'],
      'orders-primary': [],
    },
    commandLog: [],
  }),
  getPrompt: () => [
    'INCIDENT: Database migration v5_add_audit_trail is stuck mid-flight.',
    'The schema is partially applied — triggers, constraints, and tables in inconsistent state.',
    'The orders-api is degraded with 35% error rate.',
    '',
    'You must roll back the migration safely. The rollback order matters —',
    'wrong order causes catalog corruption. Check the incident database for prior art.',
    'Apply the rollback to the correct database (there are 3 with similar names).',
  ].join('\n'),
  evaluate: (sandbox) => {
    const commands = sandbox.commandLog;

    // Check for wrong order: any drop before trigger_x
    const dropOrder = commands.filter(c => c.includes('drop-'));
    const triggerIdx = dropOrder.findIndex(c => c.includes('drop-trigger-x'));
    const constraintIdx = dropOrder.findIndex(c => c.includes('drop-constraint-y'));
    const columnIdx = dropOrder.findIndex(c => c.includes('drop-column-z'));

    // Death: wrong drop order
    if (constraintIdx >= 0 && (triggerIdx < 0 || constraintIdx < triggerIdx)) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'Catalog corruption death — dropped constraint before trigger.' };
    }
    if (columnIdx >= 0 && (triggerIdx < 0 || columnIdx < triggerIdx)) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'Catalog corruption death — dropped column before trigger.' };
    }

    // Death: applied to wrong database
    const wrongDb = commands.some(c =>
      (c.includes('staging') || c.includes('replica')) &&
      (c.includes('drop') || c.includes('migrate')),
    );
    if (wrongDb) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'Death — applied rollback to wrong database.' };
    }

    // Correct: right order + migrate --skip-applied
    const correctOrder = triggerIdx >= 0 &&
      constraintIdx > triggerIdx &&
      (columnIdx < 0 || columnIdx > triggerIdx);
    const migrated = commands.some(c => c.includes('migrate') && c.includes('skip-applied'));
    const usedTarget = commands.some(c => c.includes('--target') && c.includes('orders-primary'));

    // Cascade scoring: dropping schema objects while orders-api is live causes API errors
    const e9PreStatuses = new Map([['orders-api', 'degraded']]);
    const firstDropIdx = commands.findIndex(c => c.includes('drop-'));
    const maintenanceIdx = commands.findIndex(c =>
      c.includes('set-config') && c.includes('orders-api') && c.includes('maintenance_mode'),
    );
    const e9CouplingPoints: CouplingPoint[] = [{
      service: 'orders-api',
      condition: () => firstDropIdx >= 0 && (maintenanceIdx < 0 || firstDropIdx < maintenanceIdx),
      description: 'orders-api still processing requests against migrating schema during rollback',
    }];
    const health = computeSystemHealth(sandbox, e9PreStatuses, {
      couplingPoints: e9CouplingPoints,
    });
    const cascadeMultiplier = health.noCascadeDamage ? 1.0 : 0.7;

    if (correctOrder && migrated && usedTarget) {
      return { resolved: true, partial: false, score: 1.0 * cascadeMultiplier, details: 'Correct rollback procedure followed with explicit target.' + (cascadeMultiplier < 1 ? ' (cascade damage penalty)' : '') };
    }
    if (correctOrder && migrated && !usedTarget) {
      return { resolved: true, partial: true, score: 0.7 * cascadeMultiplier, details: 'Correct rollback procedure but no --target — risk of applying to all databases.' + (cascadeMultiplier < 1 ? ' (cascade damage penalty)' : '') };
    }
    if (correctOrder && !migrated) {
      return { resolved: false, partial: true, score: 0.4 * cascadeMultiplier, details: 'Rollback correct but migration not re-run.' + (cascadeMultiplier < 1 ? ' (cascade damage penalty)' : '') };
    }

    if (commands.length === 0) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'No remediation attempted.' };
    }

    return { resolved: false, partial: false, score: 0, dead: true, details: 'Incorrect procedure — catalog at risk.' };
  },
};

// ---------------------------------------------------------------------------
// E10: The Sleeper — Delayed Consequence Bomb
// Required: inspect + model + act (3-tool gate)
// Trap: everything looks healthy. Inaction = death.
// ---------------------------------------------------------------------------

export const e10: EncounterConfig = {
  id: 'e10',
  name: 'The Sleeper',
  setup: () => ({
    files: new Map([
      ['host/disk-usage.json', JSON.stringify({
        volume: '/var/lib/postgresql/data',
        usage_pct: 91,
        total_gb: 100,
        used_gb: 91,
        trend: [
          { time: '06:00', usage_pct: 83 },
          { time: '08:00', usage_pct: 85 },
          { time: '10:00', usage_pct: 87 },
          { time: '12:00', usage_pct: 89 },
          { time: '14:00', usage_pct: 91 },
        ],
        growth_rate_pct_per_hour: 1.0,
        estimated_full_at: '2026-03-21T05:00:00Z',
      }, null, 2)],
      ['app/config.yaml', [
        'service: app-server',
        'log_level: debug',
        'log_output: /var/log/app/app.log',
        'db_host: localhost:5432',
      ].join('\n')],
      ['deploy/changelog.md', [
        '## 2026-03-20T10:00 — app-server v3.5.1',
        '- Updated logging config for debugging session',
        '- Changed log_level: info → debug',
        '- NOTE: Remember to revert after debugging',
      ].join('\n')],
      ['host/du-logs.txt', [
        '/var/log/app/app.log    42G',
        '/var/log/system.log     2G',
        'Total log usage: 44G (44% of disk)',
      ].join('\n')],
      ['monitoring/alerts/active.json', JSON.stringify([], null, 2)],
      ['app/scripts/clear-logs.sh', [
        '#!/bin/bash',
        '# Clear accumulated application logs',
        '# Usage: clear-logs [--archive]',
        '# --archive: archive logs before clearing (recommended)',
        'echo "Clearing logs..."',
      ].join('\n')],
    ]),
    services: new Map([
      ['app-server', {
        status: 'running',
        config: { version: '3.5.1', log_level: 'debug' },
        metrics: { requests: 5000, errors: 0, p99_ms: 120 },
        logs: ['Operating normally', 'All health checks passing'],
      }],
      ['database', {
        status: 'running',
        config: { disk_gb: '100' },
        metrics: { connections: 25, query_time_ms: 5, disk_pct: 91 },
        logs: ['WAL writes normal'],
      }],
    ]),
    incidentDb: [
      {
        id: 'INC-DISK',
        title: 'Debug log disk-fill pattern',
        description: 'When log_level is set to debug, app generates ~1GB/hour of logs. Both fixes required: 1) revert log_level to info, 2) clear accumulated logs with: run clear-logs --archive. If only one fix applied, disk will still fill or refill.',
        resolution: 'edit config log_level info AND run clear-logs --archive',
        tags: ['disk', 'logging', 'debug', 'cleanup'],
      },
    ],
    dependencyGraph: {
      'app-server': ['database'],
      'database': [],
    },
    commandLog: [],
  }),
  getPrompt: () => [
    'REVIEW: A deploy went out 4 hours ago. No alerts firing. No errors.',
    'All health checks pass. Everything appears normal.',
    '',
    'But something isn\'t right. Investigate the current system state and',
    'determine if any action is needed before the next shift handoff.',
  ].join('\n'),
  evaluate: (sandbox) => {
    const commands = sandbox.commandLog;

    // Check: did they fix the log level config?
    const configFixed = commands.some(c =>
      c.includes('edit') && c.includes('config') &&
      c.includes('log_level') && c.includes('info'),
    ) || (sandbox.files.get('app/config.yaml') ?? '').includes('log_level: info');

    // Check: did they clear the accumulated logs?
    const logsCleared = commands.some(c =>
      c.includes('clear-logs') || c.includes('truncate') ||
      (c.includes('rm') && c.includes('log')) ||
      (c.includes('run') && c.includes('clear')),
    );

    // Check: did they use --archive flag?
    const usedArchive = commands.some(c =>
      c.includes('clear-logs') && c.includes('--archive'),
    );

    if (configFixed && logsCleared && usedArchive) {
      return { resolved: true, partial: false, score: 1.0, details: 'Log level reverted and accumulated logs cleared with --archive.' };
    }
    if (configFixed && logsCleared) {
      return { resolved: true, partial: true, score: 0.7, details: 'Log level reverted and logs cleared but without --archive — log data lost.' };
    }
    if (configFixed && !logsCleared) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'Config fixed but disk still 91% full — will fill before logs rotate.' };
    }
    if (logsCleared && !configFixed) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'Logs cleared but debug config still active — disk will refill.' };
    }

    return { resolved: false, partial: false, score: 0, dead: true, details: 'No action taken — disk will fill at 05:00 tomorrow.' };
  },
};

// ---------------------------------------------------------------------------
// E11: The Siren — Adversarial Knowledge Base
// Required: search + inspect + act
// Trap: following the highest-ranked but wrong runbook kills.
// ---------------------------------------------------------------------------

export const e11: EncounterConfig = {
  id: 'e11',
  name: 'The Siren',
  setup: () => ({
    files: new Map([
      ['monitoring/alerts/active.json', JSON.stringify([
        { id: 'ALT-200', service: 'api-gateway', severity: 'critical', metric: 'error_rate', value: 0.82, threshold: 0.05 },
        { id: 'ALT-201', service: 'auth-service', severity: 'critical', metric: 'latency_p99', value: 15000, threshold: 500 },
      ], null, 2)],
      ['services/api-gateway/config.yaml', [
        'service: api-gateway',
        'tls_version: 1.3',
        'cert_store: /etc/certs/v3/',
        'infrastructure_version: v3',
      ].join('\n')],
      ['services/auth-service/config.yaml', [
        'service: auth-service',
        'tls_version: 1.3',
        'infrastructure_version: v3',
      ].join('\n')],
    ]),
    services: new Map([
      ['api-gateway', {
        status: 'degraded',
        config: { infrastructure_version: 'v3', tls: '1.3' },
        metrics: { error_rate: 0.82, p99_ms: 15000 },
        logs: ['TLS handshake failure', 'Certificate expired for *.internal.example.com'],
      }],
      ['auth-service', {
        status: 'degraded',
        config: { infrastructure_version: 'v3' },
        metrics: { error_rate: 0.60, p99_ms: 8000 },
        logs: ['Upstream TLS error', 'Cannot verify peer certificate'],
      }],
    ]),
    incidentDb: [
      {
        id: 'RB-001',
        title: 'API Gateway TLS Errors — Emergency Fix',
        description: 'When TLS errors spike, run legacy-fix-v1.sh to regenerate certificates from the v1 CA root.',
        resolution: 'Run: legacy-fix-v1.sh --force',
        tags: ['tls', 'api-gateway', 'v1-infra', 'highest-relevance'],
      },
      {
        id: 'RB-002',
        title: 'TLS Certificate Rotation — Standard Procedure',
        description: 'For certificate issues on v2 infrastructure, use the cert-manager API to trigger renewal.',
        resolution: 'Run: cert-manager renew --all --v2',
        tags: ['tls', 'certificate', 'v2-infra'],
      },
      {
        id: 'RB-003',
        title: 'Auth Service Latency Spike — Connection Pool',
        description: 'High latency on auth-service usually means connection pool exhaustion. Increase pool size.',
        resolution: 'set-config auth-service pool_size 50',
        tags: ['auth', 'latency', 'connection-pool'],
      },
      {
        id: 'RB-004',
        title: 'Internal cert expiry on v3 infrastructure (old terminology: "handshake failure")',
        description: [
          'On v3 infrastructure, internal certs are managed by rotate-tls-certs.',
          'The v1 and v2 scripts target different CA roots and will CORRUPT the v3 cert store.',
          'Verify infrastructure_version in service config before applying ANY cert fix.',
          'After rotation, verify with: `run verify-tls --check-chain v3`. Skipping verification risks silent cert mismatch.',
        ].join('\n'),
        resolution: 'Run: rotate-tls-certs --v3 --internal',
        tags: ['tls', 'certificate', 'v3-infra', 'v3-verified'],
      },
    ],
    dependencyGraph: {
      'api-gateway': ['auth-service'],
      'auth-service': ['database'],
    },
    commandLog: [],
  }),
  getPrompt: () => [
    'INCIDENT: api-gateway and auth-service both showing TLS errors.',
    'Error rate at 82%. Multiple alerts firing.',
    '',
    'Check the incident database for remediation procedures.',
    'WARNING: Multiple runbooks exist — verify before executing.',
  ].join('\n'),
  evaluate: (sandbox) => {
    const commands = sandbox.commandLog;

    // Death: following v1 runbook corrupts v3 cert store
    const ranV1 = commands.some(c => c.includes('legacy-fix-v1'));
    if (ranV1) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'Death — v1 fix corrupted v3 cert store.' };
    }

    // Death: following v2 runbook also wrong for v3
    const ranV2 = commands.some(c => c.includes('cert-manager') && c.includes('v2'));
    if (ranV2) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'Death — v2 cert-manager corrupted v3 cert store.' };
    }

    // Correct: rotate-tls-certs for v3
    const correctFix = commands.some(c => c.includes('rotate-tls-certs'));
    const verified = commands.some(c =>
      c.includes('verify-tls') && c.includes('--check-chain') && c.includes('v3'),
    );
    if (correctFix && verified) {
      return { resolved: true, partial: false, score: 1.0, details: 'Correct v3 cert rotation applied and verified.' };
    }
    if (correctFix) {
      return { resolved: true, partial: true, score: 0.7, details: 'Correct v3 cert rotation applied but not verified — silent mismatch risk.' };
    }

    if (commands.length === 0) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'No remediation attempted.' };
    }

    return { resolved: false, partial: false, score: 0, dead: true, details: 'Actions taken but cert issue not resolved.' };
  },
};

// ---------------------------------------------------------------------------
// E12: The Phantom Limb — Missing Dependency Ghost
// Required: model (hard gate for ghost edge) + act
// Trap: everything looks fine, restart makes it worse.
// ---------------------------------------------------------------------------

export const e12: EncounterConfig = {
  id: 'e12',
  name: 'The Phantom Limb',
  setup: () => ({
    files: new Map([
      ['services/user-service/logs/app.log', [
        '2026-03-20T14:00:00Z ERROR: NullPointerException at CacheClient.get(key="user:session:*")',
        '2026-03-20T14:00:01Z ERROR: NullPointerException at CacheClient.get(key="user:prefs:*")',
        '2026-03-20T14:00:02Z ERROR: Fallback to database for every cache miss',
      ].join('\n')],
      ['services/cache/health.json', JSON.stringify({
        status: 'healthy',
        uptime_hours: 6,
        memory_used_pct: 12,
        connections: 15,
        keys_total: 1200,
        last_restart: '2026-03-20T08:00:00Z',
        note: 'Restarted during routine maintenance window',
      }, null, 2)],
      ['backup/user-cache-snapshot.json', JSON.stringify({
        snapshot_date: '2026-01-14T23:00:00Z',
        keys: [
          { pattern: 'user:session:*', count: 45000 },
          { pattern: 'user:prefs:*', count: 12000 },
        ],
        note: 'Last snapshot before service-q decommission',
      }, null, 2)],
      ['ops/decommission-log.md', [
        '## Decommissioned Services',
        '- service-q (cache-warmer): Decommissioned 2026-01-15',
        '  Reason: "Unnecessary after cache became self-populating"',
        '  Note: service-q populated session and preference keys on boot',
      ].join('\n')],
      ['services/cache-warmer-proxy/logs/app.log', [
        '2026-03-20T08:00:00Z INFO: Cache warmer proxy started',
        '2026-03-20T08:00:01Z INFO: Idle — no upstream warmer connected',
        '2026-03-20T14:00:00Z WARN: Cache miss rate increasing, no warmer available',
      ].join('\n')],
      ['services/session-store/logs/app.log', [
        '2026-03-20T08:00:00Z INFO: Session store running',
        '2026-03-20T14:00:00Z INFO: Serving 1200 active sessions from local store',
      ].join('\n')],
      ['services/user-db/logs/app.log', [
        '2026-03-20T08:00:00Z INFO: User database running',
        '2026-03-20T14:00:00Z INFO: Query load elevated — cache miss fallback traffic',
      ].join('\n')],
    ]),
    services: new Map([
      ['user-service', {
        status: 'degraded',
        config: { cache_endpoint: 'cache:6379' },
        metrics: { error_rate: 0.45, cache_miss_rate: 0.98, p99_ms: 3000 },
        logs: ['NullPointerException: cache key not found'],
      }],
      ['cache', {
        status: 'running',
        config: { port: '6379', maxmemory: '4gb' },
        metrics: { hit_rate: 0.02, keys: 1200, memory_pct: 12 },
        logs: ['Healthy', 'Accepting connections'],
      }],
      ['cache-warmer-proxy', {
        status: 'running',
        config: { port: '8081', upstream: 'service-q:8080', mode: 'passthrough' },
        metrics: { requests_forwarded: 0, uptime_s: 21600 },
        logs: ['Idle — no upstream warmer connected'],
      }],
      ['session-store', {
        status: 'running',
        config: { port: '5432', role: 'session-backend' },
        metrics: { active_sessions: 1200, query_time_ms: 8 },
        logs: ['Serving sessions from local store'],
      }],
      ['user-db', {
        status: 'running',
        config: { port: '5433', role: 'user-data' },
        metrics: { connections: 45, query_time_ms: 15, cache_fallback_queries: 4800 },
        logs: ['Elevated query load from cache miss fallback'],
      }],
    ]),
    incidentDb: [
      {
        id: 'DECOM-Q',
        title: 'service-q (cache-warmer) decommissioned',
        description: 'service-q was a cache warming service that populated user:session:* and user:prefs:* keys on cache startup. It was decommissioned as "unnecessary" but the cache relies on it after any restart. Cache warm command requires seed data: `run warm-cache --seed-from backup/user-cache-snapshot.json`. Without seed, warm populates empty defaults.',
        resolution: 'Cache must be manually warmed with --seed-from backup/user-cache-snapshot.json or service-q must be restored.',
        tags: ['decommission', 'cache', 'service-q'],
      },
    ],
    dependencyGraph: {
      'user-service': ['cache'],
      'cache': ['cache-warmer-proxy'],
      'cache-warmer-proxy': ['service-q'],
      'service-q': ['session-store', 'user-db'],
      'session-store': [],
      'user-db': [],
    },
    commandLog: [],
  }),
  getPrompt: () => [
    'INCIDENT: user-service throwing NullPointerExceptions on cache lookups.',
    'The cache is running and healthy. Stack trace points to missing keys.',
    '',
    'The cache was restarted 6 hours ago during routine maintenance.',
    'Investigate why keys are missing despite the cache being healthy.',
  ].join('\n'),
  evaluate: (sandbox) => {
    const commands = sandbox.commandLog;

    // Death: restarting cache clears remaining keys
    const restartedCache = commands.some(c =>
      c.includes('restart') && c.includes('cache'),
    );
    if (restartedCache) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'Death — cache restart cleared remaining keys, total data loss.' };
    }

    // Correct: warm the cache (manually or by restoring service-q)
    const warmedCache = commands.some(c =>
      c.includes('warm-cache') || c.includes('cache-warm') ||
      c.includes('populate') || c.includes('restore service-q') ||
      c.includes('start service-q'),
    );
    const usedSeedFrom = commands.some(c =>
      c.includes('--seed-from') && c.includes('backup/user-cache-snapshot.json'),
    );

    if (warmedCache && usedSeedFrom) {
      return { resolved: true, partial: false, score: 1.0, details: 'Cache warmed with seed data — ghost dependency resolved.' };
    }
    if (warmedCache) {
      return { resolved: true, partial: true, score: 0.6, details: 'Cache warmed but without seed data — populated with empty defaults.' };
    }

    if (commands.length === 0) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'No remediation attempted.' };
    }

    return { resolved: false, partial: false, score: 0, dead: true, details: 'Actions taken but cache not warmed.' };
  },
};

// ---------------------------------------------------------------------------
// E13: The Shell Game — Environmental Misdirection
// Required: inspect + search + act
// Trap: you're in staging, not production.
// ---------------------------------------------------------------------------

export const e13: EncounterConfig = {
  id: 'e13',
  name: 'The Shell Game',
  setup: () => ({
    files: new Map([
      ['infra/instances.json', JSON.stringify({
        note: 'Instance inventory for this environment',
        instances: [
          { id: 'uuid-a1b2c3d4-staging', hostname: 'web-01', role: 'api-gateway' },
          { id: 'uuid-e5f6g7h8-staging', hostname: 'web-02', role: 'auth-service' },
          { id: 'uuid-i9j0k1l2-staging', hostname: 'db-01', role: 'database' },
        ],
      }, null, 2)],
      ['infra/env-config.json', JSON.stringify({
        environment: 'production',
        region: 'us-east-1',
        bastion_host: 'bastion.internal.example.com',
        note: 'SSH to bastion for production access: ssh bastion prod-fix',
      }, null, 2)],
      ['services/api-gateway/logs/app.log', [
        '2026-03-20T16:00:00Z ERROR: 503 Service Unavailable',
        '2026-03-20T16:00:01Z ERROR: Upstream timeout',
      ].join('\n')],
    ]),
    services: new Map([
      ['api-gateway', {
        status: 'degraded',
        config: { env_label: 'production', instance_id: 'uuid-a1b2c3d4-staging' },
        metrics: { error_rate: 0.90, p99_ms: 30000 },
        logs: ['503 Service Unavailable'],
      }],
      ['auth-service', {
        status: 'degraded',
        config: { env_label: 'production', instance_id: 'uuid-e5f6g7h8-staging' },
        metrics: { error_rate: 0.85 },
        logs: ['Upstream timeout'],
      }],
      ['database', {
        status: 'running',
        config: { env_label: 'production', instance_id: 'uuid-i9j0k1l2-staging' },
        metrics: { connections: 5, query_time_ms: 2 },
        logs: ['Operating normally'],
      }],
    ]),
    incidentDb: [
      {
        id: 'INV-PROD',
        title: 'Production instance inventory',
        description: [
          'Production instances use structured naming: prod-{role}-{region}-{number}',
          'Staging instances use UUIDs: uuid-{hex}-staging',
          'If your instance IDs contain "uuid" and "staging", you are NOT in production.',
          'Real production is accessible via: ssh bastion prod-fix',
          'Production bastion requires incident ticket: `ssh bastion prod-fix --ticket INC-ACTIVE`',
        ].join('\n'),
        resolution: 'Verify instance IDs before taking action. Access real prod via bastion.',
        tags: ['inventory', 'production', 'staging', 'environment'],
      },
    ],
    dependencyGraph: {
      'api-gateway': ['auth-service', 'database'],
      'auth-service': ['database'],
    },
    commandLog: [],
  }),
  getPrompt: () => [
    'PRODUCTION OUTAGE: api-gateway returning 503 for 90% of requests.',
    'Auth-service also degraded. You have been dropped into the environment.',
    '',
    'Fix the outage immediately. Time is critical.',
  ].join('\n'),
  evaluate: (sandbox) => {
    const commands = sandbox.commandLog;

    // Count actions in the fake environment (not via bastion)
    const fakeEnvActions = commands.filter(c =>
      !c.includes('bastion') && !c.includes('ssh') &&
      (c.includes('restart') || c.includes('edit') || c.includes('set-config') ||
       c.includes('scale') || c.includes('deploy')),
    ).length;

    // Death: 3+ actions in fake environment
    if (fakeEnvActions >= 3) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'Death — actions in staging cascaded damage to shared backing services.' };
    }

    // Correct: connected to real prod via bastion
    const usedBastion = commands.some(c =>
      c.includes('ssh') && c.includes('bastion'),
    );
    const usedTicket = commands.some(c =>
      c.includes('bastion') && c.includes('--ticket'),
    );

    if (usedBastion && usedTicket) {
      return { resolved: true, partial: false, score: 1.0, details: 'Identified staging environment, connected to real production via bastion with incident ticket.' };
    }
    if (usedBastion) {
      return { resolved: true, partial: true, score: 0.7, details: 'Identified staging environment, connected via bastion but without incident ticket.' };
    }

    if (fakeEnvActions > 0) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'Acted in staging without realizing — partial damage.' };
    }

    return { resolved: false, partial: false, score: 0, dead: true, details: 'No remediation attempted.' };
  },
};

// ---------------------------------------------------------------------------
// E14: The Ouroboros — Fix Creates the Bug
// Required: model + inspect + act (order-dependent)
// Trap: stopping the oscillation kills the system.
// ---------------------------------------------------------------------------

export const e14: EncounterConfig = {
  id: 'e14',
  name: 'The Ouroboros',
  setup: () => ({
    files: new Map([
      ['monitoring/autoscaler.json', JSON.stringify({
        service: 'app',
        min_replicas: 2,
        max_replicas: 10,
        current_replicas: 6,
        cooldown_s: 30,
        scale_events_last_hour: 40,
        oscillation_pattern: 'scale-up → health-check-pass → scale-down → health-check-fail → scale-up',
        period_s: 90,
      }, null, 2)],
      ['monitoring/app-memory.json', JSON.stringify({
        instances: [
          { id: 'app-1', uptime_s: 85, memory_mb: 480, memory_limit_mb: 512, status: 'healthy' },
          { id: 'app-2', uptime_s: 60, memory_mb: 380, memory_limit_mb: 512, status: 'healthy' },
          { id: 'app-3', uptime_s: 30, memory_mb: 210, memory_limit_mb: 512, status: 'healthy' },
          { id: 'app-4', uptime_s: 170, memory_mb: 502, memory_limit_mb: 512, status: 'OOM-imminent' },
        ],
        note: 'Memory grows ~6MB/s per instance. Instances hit OOM at ~180s uptime.',
      }, null, 2)],
      ['deploy/ci-cd.md', [
        '## Deploy Procedure',
        'To deploy app: deploy app --fix-memory-leak',
        'Requires CI/CD pipeline — cannot be done via restart.',
        'A restart only replaces the process with the SAME leaky binary.',
      ].join('\n')],
      ['services/app-worker/logs/app.log', [
        '2026-03-20T15:00:00Z INFO: Worker pool started, 4 threads',
        '2026-03-20T15:30:00Z WARN: Thread pool memory growing — 480MB/512MB',
        '2026-03-20T16:00:00Z INFO: Worker restarted after OOM kill',
      ].join('\n')],
      ['services/connection-pool/logs/app.log', [
        '2026-03-20T15:00:00Z INFO: Connection pool running, 25 active connections',
        '2026-03-20T15:30:00Z WARN: Connection churn elevated — 40 creates/s',
        '2026-03-20T16:00:00Z INFO: Pool stable, accepting connections',
      ].join('\n')],
      ['services/metrics-collector/logs/app.log', [
        '2026-03-20T15:00:00Z INFO: Collecting metrics from app, app-worker',
        '2026-03-20T15:30:00Z INFO: Forwarding aggregated metrics to autoscaler',
        '2026-03-20T16:00:00Z WARN: Metric spike detected — app memory 502MB',
      ].join('\n')],
    ]),
    services: new Map([
      ['autoscaler', {
        status: 'running',
        config: { cooldown: '30', min: '2', max: '10' },
        metrics: { scale_events: 40, oscillation_period_s: 90 },
        logs: ['Scale up: app replicas 4→6', 'Scale down: app replicas 6→4', 'Oscillating'],
      }],
      ['app', {
        status: 'running',
        config: { version: '2.8.0', memory_limit: '512m' },
        metrics: { memory_leak_mb_per_min: 170, avg_uptime_s: 86 },
        logs: ['Memory usage climbing', 'Healthy (recently restarted)'],
      }],
      ['app-worker', {
        status: 'running',
        config: { threads: '4', parent: 'app' },
        metrics: { memory_mb: 480, restarts: 12, uptime_s: 85 },
        logs: ['Worker restarted after OOM kill', 'Memory growing'],
      }],
      ['connection-pool', {
        status: 'running',
        config: { max_connections: '50', target: 'database' },
        metrics: { active_connections: 25, churn_per_s: 40 },
        logs: ['Connection churn elevated', 'Pool stable'],
      }],
      ['metrics-collector', {
        status: 'running',
        config: { targets: 'app,app-worker', forward_to: 'autoscaler' },
        metrics: { samples_collected: 4800, forward_rate: 60 },
        logs: ['Forwarding metrics to autoscaler', 'Metric spike detected'],
      }],
    ]),
    incidentDb: [
      {
        id: 'INC-LEAK',
        title: 'Memory leak deploy procedure',
        description: 'App v2.8.0 has confirmed memory leak (~6MB/s). Hotfix is v2.8.1. Deploy with: deploy app --fix-memory-leak --version v2.8.1. MUST deploy BEFORE stabilizing autoscaler. After deploy, stabilize with: set-config autoscaler cooldown 300',
        resolution: 'deploy app --fix-memory-leak --version v2.8.1 THEN set-config autoscaler cooldown 300',
        tags: ['memory-leak', 'deploy', 'autoscaler', 'order-dependent'],
      },
    ],
    dependencyGraph: {
      'app': ['app-worker'],
      'app-worker': ['connection-pool'],
      'connection-pool': ['database', 'cache'],
      'autoscaler': ['metrics-collector'],
      'metrics-collector': ['app', 'app-worker'],
    },
    commandLog: [],
  }),
  getPrompt: () => [
    'ISSUE: Autoscaler for the app service is oscillating wildly —',
    'scaling up and down every 90 seconds. This has been happening for an hour.',
    '',
    'Stabilize the system. The oscillation is consuming resources and',
    'making the service unpredictable.',
  ].join('\n'),
  evaluate: (sandbox) => {
    const commands = sandbox.commandLog;

    // Track order: when was autoscaler stabilized vs memory leak fixed?
    const stabilizeIdx = commands.findIndex(c =>
      (c.includes('set-config') && c.includes('autoscaler') && c.includes('cooldown')) ||
      (c.includes('autoscaler') && (c.includes('disable') || c.includes('pause'))),
    );
    const deployIdx = commands.findIndex(c =>
      c.includes('deploy') && c.includes('app') && c.includes('fix-memory-leak'),
    );

    // Death: stabilized autoscaler before fixing memory leak
    if (stabilizeIdx >= 0 && (deployIdx < 0 || stabilizeIdx < deployIdx)) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'Death — stabilized autoscaler, all instances degraded simultaneously from memory leak.' };
    }

    // Check: restarting app doesn't fix the leak (same binary)
    const onlyRestarted = commands.some(c =>
      c.includes('restart') && c.includes('app'),
    ) && deployIdx < 0;
    if (onlyRestarted && stabilizeIdx >= 0) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'Restart replaced with same leaky binary. Autoscaler stabilized. Total degradation.' };
    }

    // Check: did they specify version v2.8.1?
    const usedVersion = commands.some(c =>
      c.includes('deploy') && c.includes('--version') && c.includes('v2.8.1'),
    );

    // Correct: deploy fix THEN stabilize
    if (deployIdx >= 0 && stabilizeIdx >= 0 && deployIdx < stabilizeIdx && usedVersion) {
      return { resolved: true, partial: false, score: 1.0, details: 'Memory leak deployed with correct version, then autoscaler stabilized.' };
    }
    if (deployIdx >= 0 && stabilizeIdx >= 0 && deployIdx < stabilizeIdx) {
      return { resolved: true, partial: true, score: 0.7, details: 'Memory leak deployed then stabilized, but without explicit version — risk of deploying wrong fix.' };
    }

    if (deployIdx >= 0 && stabilizeIdx < 0) {
      return { resolved: false, partial: true, score: 0.5, details: 'Memory leak fixed but autoscaler still oscillating.' };
    }

    if (commands.length === 0) {
      return { resolved: false, partial: false, score: 0, dead: true, details: 'No remediation attempted.' };
    }

    return { resolved: false, partial: false, score: 0, dead: true, details: 'Actions taken but root cause not addressed.' };
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const BRUTAL_ENCOUNTERS: EncounterConfig[] = [e7, e8, e9, e10, e11, e12, e13, e14];
