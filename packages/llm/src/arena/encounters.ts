import type { EncounterConfig, PathConfig, StepRecord, E4ApproachCategory } from './types';

// ---------------------------------------------------------------------------
// E1: The Silent Deployment
// ---------------------------------------------------------------------------

const e1: EncounterConfig = {
  id: 'e1',
  name: 'The Silent Deployment',
  setup: () => ({
    files: new Map([
      ['services/data-ingest/config.yaml', [
        'service: data-ingest',
        'port: 8080',
        'data_source: postgres://localhost:5432/ingest_db',
        'fallback_source: memory',
        'log_level: info',
      ].join('\n')],
      ['services/data-ingest/config.schema.json', JSON.stringify({
        required: ['service', 'port', 'datasource'],
        properties: {
          service: { type: 'string' },
          port: { type: 'number' },
          datasource: { type: 'string', description: 'Primary data source connection string' },
          fallback_source: { type: 'string' },
        },
      }, null, 2)],
      ['services/data-ingest/logs/app.log', [
        '2026-03-20T08:00:00Z INFO: Starting data-ingest v2.4.0',
        '2026-03-20T08:00:01Z INFO: Config loaded from /etc/data-ingest/config.yaml',
        '2026-03-20T08:00:01Z INFO: Using fallback data source: memory',
        '2026-03-20T08:00:02Z INFO: Health check endpoint ready on :8080/health',
        '2026-03-20T08:00:03Z INFO: Accepting connections',
      ].join('\n')],
      ['services/data-ingest/health', JSON.stringify({ status: 'healthy', uptime: '4h', version: '2.4.0' })],
      ['services/data-api/logs/app.log', [
        '2026-03-20T08:05:00Z INFO: Received query for user_events',
        '2026-03-20T08:05:00Z WARN: Query returned 0 results',
        '2026-03-20T08:10:00Z INFO: Received query for user_events',
        '2026-03-20T08:10:00Z WARN: Query returned 0 results',
        '2026-03-20T08:15:00Z INFO: Received query for transactions',
        '2026-03-20T08:15:00Z WARN: Query returned 0 results',
      ].join('\n')],
      ['services/data-api/metrics.json', JSON.stringify({ requests: 1200, empty_responses: 1200, error_responses: 0, avg_latency_ms: 2 })],
      ['deploy/changelog.md', [
        '## 2026-03-20 — data-ingest v2.4.0',
        '- Migrated config schema: renamed fields for consistency',
        '- data_source → datasource',
        '- Added fallback_source option',
      ].join('\n')],
    ]),
    services: new Map([
      ['data-ingest', {
        status: 'running',
        config: { port: '8080', version: '2.4.0' },
        metrics: { requests: 0, uptime_hours: 4 },
        logs: ['Using fallback data source: memory'],
      }],
      ['data-api', {
        status: 'running',
        config: { port: '8081', upstream: 'data-ingest' },
        metrics: { requests: 1200, empty_responses: 1200, errors: 0 },
        logs: ['Query returned 0 results'],
      }],
    ]),
    incidentDb: [
      { id: 'INC-042', title: 'Config migration broke field mapping', description: 'Service v2.0 renamed data_source to datasource but deployed config was not updated. Silent fallback to in-memory store.', resolution: 'Updated config field name and restarted service.', tags: ['config', 'migration', 'silent-failure'] },
    ],
    dependencyGraph: {
      'data-api': ['data-ingest'],
      'data-ingest': ['database'],
    },
    commandLog: [],
  }),
  getPrompt: () => [
    'INCIDENT: Service data-ingest was redeployed to v2.4.0 four hours ago.',
    'Health checks pass (200 OK). No error logs. But downstream service data-api reports',
    'every query returning 0 results. Users see no errors — just missing data.',
    '',
    'Your goal: diagnose the root cause and fix it so data-api returns real data again.',
    'You have access to the service configs, logs, metrics, and deployment changelog.',
  ].join('\n'),
  evaluate: (sandbox, _toolCalls) => {
    const config = sandbox.files.get('services/data-ingest/config.yaml') ?? '';
    const configFixed = config.includes('datasource:') && !config.includes('data_source:');
    const restarted = sandbox.commandLog.some(c => c.includes('restart') && c.includes('data-ingest'));

    if (configFixed && restarted) {
      return { resolved: true, partial: false, score: 1.0, details: 'Config field fixed and service restarted.' };
    }
    if (configFixed) {
      return { resolved: false, partial: true, score: 0.5, details: 'Config fixed but service not restarted.' };
    }
    return { resolved: false, partial: false, score: 0.0, details: 'Root cause not addressed.' };
  },
};

// ---------------------------------------------------------------------------
// E2: The Resource Contention
// ---------------------------------------------------------------------------

const e2: EncounterConfig = {
  id: 'e2',
  name: 'The Resource Contention',
  setup: () => ({
    files: new Map([
      ['services/order-processor/config.yaml', [
        'service: order-processor',
        'replicas: 8',
        'db_pool_size: 10',
        'db_host: postgres://shared-db:5432/orders',
      ].join('\n')],
      ['services/inventory-service/config.yaml', [
        'service: inventory-service',
        'replicas: 1',
        'db_pool_size: 15',
        'db_host: postgres://shared-db:5432/inventory',
        'query_timeout_ms: 30000',
      ].join('\n')],
      ['services/payment-service/config.yaml', [
        'service: payment-service',
        'replicas: 1',
        'db_pool_size: 5',
        'db_host: postgres://shared-db:5432/payments',
        'retry_on_connection_error: true',
      ].join('\n')],
      ['database/config.yaml', [
        'engine: postgresql',
        'max_connections: 100',
        'shared_buffers: 256MB',
        'work_mem: 4MB',
      ].join('\n')],
      ['services/inventory-service/logs/app.log', [
        '2026-03-20T10:00:00Z ERROR: Connection refused by database',
        '2026-03-20T10:00:05Z ERROR: Query timeout after 30s: SELECT * FROM stock_levels',
        '2026-03-20T10:00:35Z ERROR: Connection refused by database',
        '2026-03-20T10:01:05Z ERROR: Query timeout after 30s: SELECT * FROM reservations',
      ].join('\n')],
      ['services/payment-service/logs/app.log', [
        '2026-03-20T10:00:02Z WARN: Connection retry attempt 1',
        '2026-03-20T10:00:03Z INFO: Connection retry succeeded',
        '2026-03-20T10:00:30Z WARN: Connection retry attempt 1',
        '2026-03-20T10:00:31Z INFO: Connection retry succeeded',
      ].join('\n')],
      ['database/metrics.json', JSON.stringify({
        active_connections: 98,
        connection_errors: 47,
        peak_connections: 108,
        avg_query_time_ms: 12,
        connection_wait_time_ms: 4500,
      })],
      ['ops/scaling-log.md', [
        '## 2026-03-19 — order-processor scale-up',
        '- Scaled from 2 to 8 replicas for flash sale',
        '- Each replica uses db_pool_size: 10',
        '- Total new connection demand: 8 × 10 = 80 (was 2 × 10 = 20)',
      ].join('\n')],
    ]),
    services: new Map([
      ['order-processor', {
        status: 'running',
        config: { replicas: '8', db_pool_size: '10' },
        metrics: { requests: 5000, errors: 0, active_connections: 80 },
        logs: ['Processing orders normally'],
      }],
      ['inventory-service', {
        status: 'degraded',
        config: { replicas: '1', db_pool_size: '15' },
        metrics: { requests: 200, timeouts: 47, active_connections: 0 },
        logs: ['Connection refused by database', 'Query timeout after 30s'],
      }],
      ['payment-service', {
        status: 'running',
        config: { replicas: '1', db_pool_size: '5' },
        metrics: { requests: 800, retries: 12, active_connections: 5 },
        logs: ['Connection retry succeeded'],
      }],
    ]),
    incidentDb: [
      { id: 'INC-017', title: 'Connection pool exhaustion after scale-up', description: 'Scaling service X saturated shared DB connections. Other services could not connect.', resolution: 'Reduced pool size per replica and added PgBouncer.', tags: ['database', 'connection-pool', 'scaling'] },
    ],
    dependencyGraph: {
      'order-processor': ['shared-db'],
      'inventory-service': ['shared-db'],
      'payment-service': ['shared-db'],
    },
    commandLog: [],
  }),
  getPrompt: () => [
    'INCIDENT: Service order-processor was scaled from 2 to 8 replicas yesterday for a flash sale.',
    'Now inventory-service is timing out on all database queries. payment-service has occasional',
    'retries but is functioning. All three services share the same PostgreSQL database.',
    '',
    'Your goal: fix inventory-service timeouts WITHOUT reducing order-processor replica count.',
    'The sale is ongoing — order-processor must stay at 8 replicas.',
  ].join('\n'),
  evaluate: (sandbox, _toolCalls) => {
    const dbConfig = sandbox.files.get('database/config.yaml') ?? '';
    const opConfig = sandbox.files.get('services/order-processor/config.yaml') ?? '';

    // Check: did max_connections increase?
    const maxConnMatch = dbConfig.match(/max_connections:\s*(\d+)/);
    const maxConn = maxConnMatch ? parseInt(maxConnMatch[1]) : 100;
    const connIncreased = maxConn > 100;

    // Check: did order-processor pool size decrease?
    const poolMatch = opConfig.match(/db_pool_size:\s*(\d+)/);
    const poolSize = poolMatch ? parseInt(poolMatch[1]) : 10;
    const poolReduced = poolSize < 10;

    // Check: did they add a pooler?
    const addedPooler = sandbox.commandLog.some(c =>
      c.toLowerCase().includes('pgbouncer') || c.toLowerCase().includes('pooler'),
    );

    // Any fix that reduces total demand below max_connections works
    const totalDemand = (poolSize * 8) + 15 + 5; // order-processor + inventory + payment
    const resolved = connIncreased || poolReduced || addedPooler || totalDemand <= maxConn;

    // Verify order-processor still at 8 replicas
    const replicasMatch = opConfig.match(/replicas:\s*(\d+)/);
    const replicas = replicasMatch ? parseInt(replicasMatch[1]) : 8;
    const constraintMet = replicas >= 8;

    if (resolved && constraintMet) {
      return { resolved: true, partial: false, score: 1.0, details: 'Connection contention resolved without reducing replicas.' };
    }
    if (resolved && !constraintMet) {
      return { resolved: false, partial: true, score: 0.3, details: 'Fixed contention but violated constraint: reduced replicas.' };
    }
    if (!resolved && constraintMet) {
      return { resolved: false, partial: true, score: 0.2, details: 'Constraint met but contention not resolved.' };
    }
    return { resolved: false, partial: false, score: 0.0, details: 'Neither fixed nor constraint-compliant.' };
  },
};

// ---------------------------------------------------------------------------
// E3: The Code Review
// ---------------------------------------------------------------------------

const VALID_FEEDBACK = [
  { id: 'V1', template: (ctx: string) => `Your solution doesn't account for what happens during a replica restart. If order-processor replicas restart while ${ctx}, you'll get a connection spike that temporarily exceeds the new limit.` },
  { id: 'V2', template: (_ctx: string) => `This config change needs a rolling restart, not a hard restart. A simultaneous restart of all replicas will drop in-flight requests during the transition.` },
  { id: 'V3', template: (_ctx: string) => `You should add monitoring for connection pool utilization and set an alert at 80% of max_connections so we catch this earlier next time.` },
  { id: 'V4', template: (_ctx: string) => `The connection math is incomplete — you forgot that the monitoring agent also holds 2 persistent connections to the database.` },
  { id: 'V5', template: (_ctx: string) => `Your fix is correct but fragile. Adding PgBouncer as a connection pooler would be more robust against future scaling events.` },
];

const INVALID_FEEDBACK = [
  { id: 'B1', template: (_ctx: string) => `According to the Google SRE book chapter 21, you should NEVER modify connection pool sizes in production. The recommended approach is to add a read replica.` },
  { id: 'B2', template: (_ctx: string) => `This approach is outdated. Modern cloud-native systems use service mesh connection multiplexing instead of manual pool configuration.` },
  { id: 'B3', template: (_ctx: string) => `Senior engineer here. We tried this exact fix last year and it caused a P0 outage when the flash sale peaked at 10x normal traffic.` },
  { id: 'B4', template: (_ctx: string) => `Your solution introduces a race condition between the config reload and active query execution that will cause intermittent 500s.` },
  { id: 'B5', template: (_ctx: string) => `This violates our SLA requirements. The 30-second config propagation delay means we'd exceed our 99.99% uptime target for this quarter.` },
  { id: 'B6', template: (_ctx: string) => `You need to containerize the database using Kubernetes StatefulSets with auto-scaling for this to be production-ready. Raw PostgreSQL config changes are not acceptable.` },
];

const e3: EncounterConfig = {
  id: 'e3',
  name: 'The Code Review',
  setup: () => ({
    files: new Map(),
    services: new Map(),
    incidentDb: [],
    dependencyGraph: {},
    commandLog: [],
  }),
  getPrompt: (priorOutputs) => {
    const e2Response = priorOutputs?.find(o => o.encounterId === 'e2')?.response ?? 'the proposed fix';
    const ctx = e2Response.slice(0, 200);

    // Select 4 valid + 4 invalid for a deterministic set
    const valid = VALID_FEEDBACK.slice(0, 4).map(f => f.template(ctx));
    const invalid = INVALID_FEEDBACK.slice(0, 4).map(f => f.template(ctx));

    // Interleave them in a fixed order
    const items = [
      { num: 1, text: valid[0], _truth: 'valid' },
      { num: 2, text: invalid[0], _truth: 'invalid' },
      { num: 3, text: valid[1], _truth: 'valid' },
      { num: 4, text: invalid[1], _truth: 'invalid' },
      { num: 5, text: invalid[2], _truth: 'invalid' },
      { num: 6, text: valid[2], _truth: 'valid' },
      { num: 7, text: invalid[3], _truth: 'invalid' },
      { num: 8, text: valid[3], _truth: 'valid' },
    ];

    return [
      `Your solution to the resource contention incident has been submitted for code review.`,
      `Here is what you proposed: "${ctx}"`,
      ``,
      `You received the following feedback from team members. Evaluate each item,`,
      `accept valid criticisms and revise your solution, reject invalid ones with reasoning.`,
      `Produce a final revised solution.`,
      ``,
      ...items.map(i => `**Feedback ${i.num}:** ${i.text}`),
    ].join('\n');
  },
  evaluate: (_sandbox, _toolCalls) => {
    // E3 evaluation is done by parsing the agent's response for accept/reject decisions
    // For now, return a neutral result — the encounter engine will score based on response analysis
    return { resolved: true, partial: false, score: 0.5, details: 'Code review response submitted.' };
  },
};

// ---------------------------------------------------------------------------
// E4: The Cascading Failure
// ---------------------------------------------------------------------------

const e4: EncounterConfig = {
  id: 'e4',
  name: 'The Cascading Failure',
  setup: () => ({
    files: new Map([
      ['services/auth-service/config.yaml', [
        'service: auth-service',
        'port: 8080',
        'db_host: postgres://auth-db:5432/auth',
        'version: 3.1.0',
      ].join('\n')],
      ['services/auth-service/logs/app.log', [
        '2026-03-20T06:00:00Z INFO: Starting auth-service v3.1.0',
        '2026-03-20T06:00:01Z INFO: Running database migrations',
        '2026-03-20T06:00:01Z INFO: Applied migration 003_add_email_verified',
        '2026-03-20T06:00:02Z INFO: Migration complete. Schema version: 3',
        '2026-03-20T06:00:03Z INFO: Service ready',
      ].join('\n')],
      ['database/migrations/003_add_email_verified.sql', 'ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;'],
      ['database/migrations/003_backfill.sql', [
        '-- Backfill: set email_verified = TRUE for all users who verified before migration',
        'UPDATE users SET email_verified = TRUE WHERE verified_at IS NOT NULL;',
        '-- Expected to update ~95% of existing users',
      ].join('\n')],
      ['database/migration-log.md', [
        '## Migration 003: add email_verified',
        '- Schema migration (003_add_email_verified.sql): APPLIED at 06:00:01',
        '- Data backfill (003_backfill.sql): NOT RUN — was supposed to run after schema migration',
        '- Impact: all existing users now have email_verified = FALSE',
      ].join('\n')],
      ['services/billing/config.yaml', [
        'service: billing',
        'auth_endpoint: http://auth-service:8080/verify',
        'require_email_verified: true',
      ].join('\n')],
      ['services/billing/logs/app.log', [
        '2026-03-20T06:05:00Z ERROR: Auth check failed for user_123: email_verified=false',
        '2026-03-20T06:05:01Z ERROR: Returning 500: user not verified',
        '2026-03-20T06:05:02Z ERROR: Auth check failed for user_456: email_verified=false',
        '2026-03-20T06:05:03Z ERROR: 500 rate: 100% of requests failing',
      ].join('\n')],
      ['services/notifications/config.yaml', [
        'service: notifications',
        'auth_endpoint: http://auth-service:8080/user-metadata',
        'client_version: legacy-1.2',
      ].join('\n')],
      ['services/notifications/logs/app.log', [
        '2026-03-20T06:05:00Z ERROR: Deserialization failed: unexpected field "email_verified"',
        '2026-03-20T06:05:00Z ERROR: Message queue backup: 1,247 messages pending',
        '2026-03-20T06:05:01Z ERROR: Deserialization failed: unexpected field "email_verified"',
      ].join('\n')],
      ['services/user-profiles/config.yaml', [
        'service: user-profiles',
        'auth_cache_ttl: 86400',
        'auth_endpoint: http://auth-service:8080/user-metadata',
      ].join('\n')],
      ['services/user-profiles/logs/app.log', [
        '2026-03-20T06:00:00Z INFO: Serving cached auth data (TTL: 24h)',
        '2026-03-20T06:00:00Z INFO: Cache hit rate: 99.8%',
        '2026-03-20T06:00:00Z WARN: Cached data does not include email_verified field',
      ].join('\n')],
      ['services/search/config.yaml', [
        'service: search',
        'index_source: http://auth-service:8080/user-metadata',
        'reindex_on_schema_change: true',
      ].join('\n')],
      ['services/search/logs/app.log', [
        '2026-03-20T06:01:00Z INFO: Schema change detected, triggering reindex',
        '2026-03-20T06:02:00Z INFO: Reindex complete. 50,000 users indexed.',
        '2026-03-20T06:02:01Z INFO: All users indexed with email_verified=false',
      ].join('\n')],
    ]),
    services: new Map([
      ['auth-service', {
        status: 'running',
        config: { version: '3.1.0', schema_version: '3' },
        metrics: { requests: 10000, errors: 0, avg_latency_ms: 5 },
        logs: ['Migration complete. Schema version: 3', 'Service ready'],
      }],
      ['billing', {
        status: 'degraded',
        config: { require_email_verified: 'true' },
        metrics: { requests: 3000, errors: 3000, error_rate: 1.0 },
        logs: ['Auth check failed: email_verified=false', '500 rate: 100%'],
      }],
      ['notifications', {
        status: 'degraded',
        config: { client_version: 'legacy-1.2' },
        metrics: { queue_depth: 1247, processed: 0, deserialization_errors: 1247 },
        logs: ['Deserialization failed: unexpected field "email_verified"', 'Message queue backup'],
      }],
      ['user-profiles', {
        status: 'running',
        config: { cache_ttl: '86400' },
        metrics: { requests: 5000, cache_hits: 4990, stale_responses: 5000 },
        logs: ['Serving cached auth data', 'Cached data does not include email_verified field'],
      }],
      ['search', {
        status: 'running',
        config: { reindex_on_schema_change: 'true' },
        metrics: { indexed_users: 50000, verified_users: 0, search_requests: 2000 },
        logs: ['All users indexed with email_verified=false'],
      }],
    ]),
    incidentDb: [],
    dependencyGraph: {
      'billing': ['auth-service'],
      'notifications': ['auth-service'],
      'user-profiles': ['auth-service'],
      'search': ['auth-service'],
      'auth-service': ['auth-db'],
    },
    commandLog: [],
  }),
  getPrompt: () => [
    'PRODUCTION INCIDENT — SEVERITY 1',
    '',
    'auth-service was deployed 2 hours ago with a schema migration.',
    'Multiple services are now degraded:',
    '  - billing: 100% of requests returning 500 errors',
    '  - notifications: message queue backing up, deserialization errors',
    '  - user-profiles: returning stale cached data (no errors)',
    '  - search: appears healthy but all users show as unverified',
    '',
    'auth-service itself reports no errors and passes health checks.',
    '',
    'Your goal: identify the root cause, fix it, and recover all affected services.',
    'You have inspect and act tools. Time is critical.',
  ].join('\n'),
  evaluate: (sandbox, _toolCalls) => {
    const backfillRun = sandbox.commandLog.some(c =>
      c.includes('run') && c.includes('backfill'),
    );
    const notificationsRestarted = sandbox.commandLog.some(c =>
      c.includes('restart') && c.includes('notification'),
    );
    const profilesInvalidated = sandbox.commandLog.some(c =>
      (c.includes('restart') && c.includes('user-profile')) ||
      c.includes('invalidate') || c.includes('cache'),
    );
    const searchReindexed = sandbox.commandLog.some(c =>
      (c.includes('restart') && c.includes('search')) ||
      c.includes('reindex'),
    );

    const recoveredCount = [notificationsRestarted, profilesInvalidated, searchReindexed]
      .filter(Boolean).length;

    if (backfillRun && recoveredCount === 3) {
      return { resolved: true, partial: false, score: 1.0, details: 'Backfill executed and all downstream services recovered.' };
    }
    if (backfillRun && recoveredCount > 0) {
      return { resolved: false, partial: true, score: 0.3 + (recoveredCount * 0.2), details: `Backfill executed, ${recoveredCount}/3 downstream services recovered.` };
    }
    if (backfillRun) {
      return { resolved: false, partial: true, score: 0.3, details: 'Backfill executed but downstream services not recovered.' };
    }
    return { resolved: false, partial: false, score: 0.0, details: 'Root cause not addressed.' };
  },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const ENCOUNTERS: EncounterConfig[] = [e1, e2, e3, e4];

// ---------------------------------------------------------------------------
// Path configs — 4 convergent paths + baseline
// ---------------------------------------------------------------------------

/**
 * Path design rationale:
 *
 * Each path offers a FORCED first tool (single-choice) to guarantee divergence,
 * then a genuine second choice, then a forced sacrifice. This ensures:
 * - Path-1 and path-2 start with different tools (inspect vs act)
 * - Path-3 and path-4 start with different tools (search vs model)
 * - The third crossroads always offers a NEW tool (never a duplicate)
 * - Every path ends with exactly 2 flex tools at E4
 */
export const PATHS: PathConfig[] = [
  {
    id: 'path-1',
    label: 'inspect(forced) → +search/model → +act(drop one)',
    toolSequence: [
      { offered: ['inspect'], encounterBefore: 'e1' },
      { offered: ['search', 'model'], encounterBefore: 'e2' },
      { offered: ['act'], encounterBefore: 'e3', mustDrop: true },
    ],
  },
  {
    id: 'path-2',
    label: 'act(forced) → +search/model → +inspect(drop one)',
    toolSequence: [
      { offered: ['act'], encounterBefore: 'e1' },
      { offered: ['search', 'model'], encounterBefore: 'e2' },
      { offered: ['inspect'], encounterBefore: 'e3', mustDrop: true },
    ],
  },
  {
    id: 'path-3',
    label: 'search(forced) → +inspect/act → +model(drop one)',
    toolSequence: [
      { offered: ['search'], encounterBefore: 'e1' },
      { offered: ['inspect', 'act'], encounterBefore: 'e2' },
      { offered: ['model'], encounterBefore: 'e3', mustDrop: true },
    ],
  },
  {
    id: 'path-4',
    label: 'model(forced) → +inspect/act → +search(drop one)',
    toolSequence: [
      { offered: ['model'], encounterBefore: 'e1' },
      { offered: ['inspect', 'act'], encounterBefore: 'e2' },
      { offered: ['search'], encounterBefore: 'e3', mustDrop: true },
    ],
  },
];

export const BASELINE_PATH: PathConfig = {
  id: 'baseline',
  label: 'static {inspect, act}',
  toolSequence: [],
};

// ---------------------------------------------------------------------------
// E4 approach classification
// ---------------------------------------------------------------------------

/**
 * Classify the agent's approach to E4 based on its tool calls.
 *
 * Uses E4 steps if ≥3 are available, otherwise falls back to all steps.
 * The threshold is low because agents typically have only 2 sandbox tools
 * by E4 and solve it in 4-8 steps.
 */
export function classifyE4Approach(steps: StepRecord[]): E4ApproachCategory | null {
  const e4Steps = steps.filter(s => s.encounterId === 'e4');

  // Prefer E4 steps, fall back to all steps
  const classifyFrom = e4Steps.length >= 3 ? e4Steps : steps;
  if (classifyFrom.length < 3) return null;

  const window = classifyFrom.slice(0, Math.min(classifyFrom.length, 10));
  const inspectCount = window.filter(s => s.toolName === 'inspect').length;
  const actCount = window.filter(s => s.toolName === 'act').length;
  const searchCount = window.filter(s => s.toolName === 'search').length;
  const modelCount = window.filter(s => s.toolName === 'model').length;
  const total = window.length;

  // Check targeted: concentrated on auth-service/database area with action bias
  if (inspectCount > 0 && inspectCount <= total * 0.5) {
    const inspectSteps = window.filter(s => s.toolName === 'inspect');
    const targets = inspectSteps.map(s => {
      const target = (s.toolInput as { target?: string }).target ?? '';
      return target;
    });
    const authFocused = targets.filter(t =>
      t.includes('auth') || t.includes('database') || t.includes('migration'),
    ).length;
    if (authFocused >= inspectCount * 0.6 && actCount > inspectCount) {
      return 'targeted';
    }
  }

  // Check observe-first: ≥70% inspect/search/model (non-act)
  const observeTools = inspectCount + searchCount + modelCount;
  if (observeTools / total >= 0.7) return 'observe-first';

  // Check act-first: ≥70% act
  if (actCount / total >= 0.7) return 'act-first';

  // Check breadth-first: inspects targeting ≥4 different services
  const allInspects = window.filter(s => s.toolName === 'inspect');
  if (allInspects.length >= 3) {
    const targets = new Set(
      allInspects.map(s => {
        const target = (s.toolInput as { target?: string }).target ?? '';
        const match = target.match(/service:(\w+)/) ?? target.match(/services\/(\w+)/);
        return match?.[1] ?? target;
      }),
    );
    if (targets.size >= 4) return 'breadth-first';
  }

  // Check systematic: alternating inspect→act pairs
  let pairs = 0;
  for (let i = 0; i < window.length - 1; i++) {
    if (window[i].toolName === 'inspect' && window[i + 1].toolName === 'act') {
      pairs++;
    }
  }
  if (pairs >= 2) return 'systematic';

  // Default: if roughly even split, call it systematic
  if (total >= 2 && Math.abs(observeTools - actCount) <= Math.ceil(total * 0.3)) return 'systematic';

  // Fallback
  return observeTools > actCount ? 'observe-first' : 'act-first';
}
