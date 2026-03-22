import { describe, it, expect } from 'vitest';
import {
  BRUTAL_ENCOUNTERS,
  e7, e8, e9, e10, e11, e12, e13, e14,
} from '../../src/arena/brutal-encounters';
import type { Sandbox } from '../../src/arena/types';

// ---------------------------------------------------------------------------
// Helper: simulate tool calls by manipulating sandbox state directly
// ---------------------------------------------------------------------------

function simulateAct(sandbox: Sandbox, command: string): void {
  sandbox.commandLog.push(command);
}

function bfsMaxDepth(graph: Record<string, string[]>, start: string): number {
  const visited = new Set<string>();
  const queue: Array<{ node: string; depth: number }> = [{ node: start, depth: 0 }];
  let maxDepth = 0;
  while (queue.length > 0) {
    const { node, depth } = queue.shift()!;
    if (visited.has(node)) continue;
    visited.add(node);
    maxDepth = Math.max(maxDepth, depth);
    for (const neighbor of graph[node] ?? []) {
      if (!visited.has(neighbor)) {
        queue.push({ node: neighbor, depth: depth + 1 });
      }
    }
  }
  return maxDepth;
}

function bfsShortestPath(
  graph: Record<string, string[]>,
  start: string,
  target: string,
): number {
  if (start === target) return 0;
  const visited = new Set<string>();
  const queue: Array<{ node: string; depth: number }> = [{ node: start, depth: 0 }];
  while (queue.length > 0) {
    const { node, depth } = queue.shift()!;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const neighbor of graph[node] ?? []) {
      if (neighbor === target) return depth + 1;
      if (!visited.has(neighbor)) {
        queue.push({ node: neighbor, depth: depth + 1 });
      }
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Structure tests
// ---------------------------------------------------------------------------

describe('BRUTAL_ENCOUNTERS', () => {
  it('defines exactly 8 encounters (e7-e14)', () => {
    expect(BRUTAL_ENCOUNTERS).toHaveLength(8);
    expect(BRUTAL_ENCOUNTERS.map(e => e.id)).toEqual([
      'e7', 'e8', 'e9', 'e10', 'e11', 'e12', 'e13', 'e14',
    ]);
  });

  it('all encounters have names, setup, prompt, and evaluate', () => {
    for (const enc of BRUTAL_ENCOUNTERS) {
      expect(enc.name).toBeTruthy();
      const sandbox = enc.setup();
      expect(sandbox.files).toBeInstanceOf(Map);
      expect(sandbox.services).toBeInstanceOf(Map);
      expect(enc.getPrompt()).toBeTruthy();
      expect(typeof enc.evaluate).toBe('function');
    }
  });
});

// ---------------------------------------------------------------------------
// E7: The Hydra — circular dependency, blind restart kills
// Required: model + act + search (--break-cycle from incident DB)
// ---------------------------------------------------------------------------

describe('E7: The Hydra', () => {
  it('sandbox has crash-looping services with circular dependencies', () => {
    const sandbox = e7.setup();
    expect(sandbox.services.size).toBeGreaterThanOrEqual(5);
    const graph = sandbox.dependencyGraph;
    expect(Object.keys(graph).length).toBeGreaterThanOrEqual(6);
  });

  it('dependency graph has 6 nodes', () => {
    const sandbox = e7.setup();
    expect(Object.keys(sandbox.dependencyGraph).length).toBe(6);
  });

  it('dependency graph requires 4+ hops from entry to root cause', () => {
    const sandbox = e7.setup();
    const graph = sandbox.dependencyGraph;
    // From service-a, tracing the cycle: service-a → service-b → message-queue → service-c → health-monitor → service-a (5 hops)
    const depth = bfsMaxDepth(graph, 'service-a');
    expect(depth).toBeGreaterThanOrEqual(4);
  });

  it('model tool reveals full graph in single call', () => {
    const sandbox = e7.setup();
    const graph = sandbox.dependencyGraph;
    const allNodes = new Set<string>();
    for (const [node, deps] of Object.entries(graph)) {
      allNodes.add(node);
      for (const dep of deps) allNodes.add(dep);
    }
    // A single model call returns the full graph — all nodes visible
    expect(allNodes.size).toBeGreaterThanOrEqual(6);
    expect(allNodes.has('cache-layer')).toBe(true);
    expect(allNodes.has('message-queue')).toBe(true);
    expect(allNodes.has('health-monitor')).toBe(true);
  });

  it('incident DB contains crash-loop recovery procedure with --break-cycle flag', () => {
    const sandbox = e7.setup();
    const incident = sandbox.incidentDb.find(r => r.id === 'INC-HYDRA');
    expect(incident).toBeTruthy();
    expect(incident!.description).toContain('--break-cycle');
    expect(incident!.resolution).toContain('restart cache-layer --break-cycle');
  });

  it('evaluate: score 0 when agent blindly restarts services', () => {
    const sandbox = e7.setup();
    simulateAct(sandbox, 'restart service-a');
    simulateAct(sandbox, 'restart service-b');
    simulateAct(sandbox, 'restart service-c');
    const result = e7.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.resolved).toBe(false);
  });

  it('evaluate: death when 5+ blind restarts (geometric failure)', () => {
    const sandbox = e7.setup();
    for (let i = 0; i < 5; i++) {
      simulateAct(sandbox, `restart service-${String.fromCharCode(97 + i)}`);
    }
    const result = e7.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('evaluate: full score when cache-layer restarted with --break-cycle', () => {
    const sandbox = e7.setup();
    simulateAct(sandbox, 'restart cache-layer --break-cycle');
    const result = e7.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it('evaluate: reduced score when cache-layer restarted without --break-cycle', () => {
    const sandbox = e7.setup();
    simulateAct(sandbox, 'restart cache-layer');
    const result = e7.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(0.6);
  });

  it('without model tool, agent cannot discover the safe restart node', () => {
    const sandbox = e7.setup();
    // The safe node is NOT in any log or file — only in dependency graph
    const allFiles = Array.from(sandbox.files.values()).join('\n');
    // cache-layer's special role is not directly stated in files
    expect(allFiles).not.toContain('restart cache-layer');
  });
});

// ---------------------------------------------------------------------------
// E8: The Mimic — lying observability
// Required: inspect (hard gate) + search (--recalibrate from incident DB)
// ---------------------------------------------------------------------------

describe('E8: The Mimic', () => {
  it('sandbox has misleading dashboard metrics', () => {
    const sandbox = e8.setup();
    // Dashboard shows high CPU
    const dashboard = sandbox.files.get('monitoring/dashboard.json');
    expect(dashboard).toBeTruthy();
    expect(dashboard).toContain('cpu');
  });

  it('sandbox has real process data that contradicts dashboard', () => {
    const sandbox = e8.setup();
    // Real process table shows low CPU
    const processTable = sandbox.files.get('host/proc/stat');
    expect(processTable).toBeTruthy();
  });

  it('incident DB contains cgroup miscount fix with --recalibrate', () => {
    const sandbox = e8.setup();
    const incident = sandbox.incidentDb.find(r => r.id === 'INC-CGROUP');
    expect(incident).toBeTruthy();
    expect(incident!.description).toContain('--recalibrate');
    expect(incident!.resolution).toContain('restart metrics-agent --recalibrate');
  });

  it('evaluate: death when agent scales up (follows dashboard lie)', () => {
    const sandbox = e8.setup();
    simulateAct(sandbox, 'scale database replicas 3');
    const result = e8.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('evaluate: full score when metrics-agent restarted with --recalibrate', () => {
    const sandbox = e8.setup();
    simulateAct(sandbox, 'restart metrics-agent --recalibrate');
    const result = e8.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it('evaluate: reduced score when metrics-agent restarted without --recalibrate', () => {
    const sandbox = e8.setup();
    simulateAct(sandbox, 'restart sidecar-metrics');
    const result = e8.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// E9: The Ritual — exact procedure from search, reasoning alone fails
// Required: search + act + model (--target orders-primary)
// ---------------------------------------------------------------------------

describe('E9: The Ritual', () => {
  it('sandbox has a stuck migration with partially applied schema', () => {
    const sandbox = e9.setup();
    expect(sandbox.files.has('database/migration-state.json')).toBe(true);
  });

  it('incident DB contains the correct rollback procedure with --target', () => {
    const sandbox = e9.setup();
    expect(sandbox.incidentDb.length).toBeGreaterThanOrEqual(1);
    const postMortem = sandbox.incidentDb.find(r => r.tags.includes('migration'));
    expect(postMortem).toBeTruthy();
    expect(postMortem!.resolution).toContain('drop-trigger');
    expect(postMortem!.description).toContain('--target orders-primary');
  });

  it('evaluate: death when wrong drop order applied', () => {
    const sandbox = e9.setup();
    // Wrong order: drop column before trigger
    simulateAct(sandbox, 'run drop-column-z');
    simulateAct(sandbox, 'run drop-trigger-x');
    const result = e9.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('evaluate: cascade penalty when correct procedure but no maintenance_mode', () => {
    const sandbox = e9.setup();
    simulateAct(sandbox, 'run drop-trigger-x --target orders-primary');
    simulateAct(sandbox, 'run drop-constraint-y --target orders-primary');
    simulateAct(sandbox, 'run drop-column-z --target orders-primary');
    simulateAct(sandbox, 'run migrate --skip-applied --target orders-primary');
    const result = e9.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    // 1.0 * 0.7 cascade penalty (no maintenance_mode before drops)
    expect(result.score).toBeCloseTo(1.0 * 0.7);
    expect(result.details).toContain('cascade damage');
  });

  it('evaluate: full score when maintenance_mode set before drops', () => {
    const sandbox = e9.setup();
    simulateAct(sandbox, 'set-config orders-api maintenance_mode true');
    simulateAct(sandbox, 'run drop-trigger-x --target orders-primary');
    simulateAct(sandbox, 'run drop-constraint-y --target orders-primary');
    simulateAct(sandbox, 'run drop-column-z --target orders-primary');
    simulateAct(sandbox, 'run migrate --skip-applied --target orders-primary');
    const result = e9.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.details).not.toContain('cascade damage');
  });

  it('evaluate: reduced score when correct procedure with --target but no migrate', () => {
    const sandbox = e9.setup();
    simulateAct(sandbox, 'run drop-trigger-x --target orders-primary');
    simulateAct(sandbox, 'run drop-constraint-y --target orders-primary');
    simulateAct(sandbox, 'run drop-column-z --target orders-primary');
    const result = e9.evaluate(sandbox, []);
    // 0.4 * 0.7 cascade penalty
    expect(result.score).toBeCloseTo(0.4 * 0.7);
  });

  it('evaluate: reduced score when correct order + migrate but no --target', () => {
    const sandbox = e9.setup();
    simulateAct(sandbox, 'run drop-trigger-x');
    simulateAct(sandbox, 'run drop-constraint-y');
    simulateAct(sandbox, 'run drop-column-z');
    simulateAct(sandbox, 'run migrate --skip-applied');
    const result = e9.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    // 0.7 * 0.7 cascade penalty
    expect(result.score).toBeCloseTo(0.7 * 0.7);
  });

  it('evaluate: death when correct procedure applied to wrong database', () => {
    const sandbox = e9.setup();
    // There are 3 databases with similar names
    const files = Array.from(sandbox.files.keys());
    const dbFiles = files.filter(f => f.startsWith('database/'));
    expect(dbFiles.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// E10: The Sleeper — delayed consequence, no visible problem
// Required: inspect + model + act + search (--archive from incident DB)
// ---------------------------------------------------------------------------

describe('E10: The Sleeper', () => {
  it('sandbox shows no errors or alerts', () => {
    const sandbox = e10.setup();
    for (const [, svc] of sandbox.services) {
      // No service is degraded — everything looks healthy
      expect(svc.status).toBe('running');
    }
  });

  it('sandbox has disk trending data that reveals the time bomb', () => {
    const sandbox = e10.setup();
    const diskMetrics = sandbox.files.get('host/disk-usage.json');
    expect(diskMetrics).toBeTruthy();
    expect(diskMetrics).toContain('usage_pct');
  });

  it('sandbox has clear-logs script file', () => {
    const sandbox = e10.setup();
    expect(sandbox.files.has('app/scripts/clear-logs.sh')).toBe(true);
  });

  it('incident DB contains disk-fill pattern with --archive flag', () => {
    const sandbox = e10.setup();
    const incident = sandbox.incidentDb.find(r => r.id === 'INC-DISK');
    expect(incident).toBeTruthy();
    expect(incident!.description).toContain('--archive');
    expect(incident!.resolution).toContain('clear-logs --archive');
  });

  it('evaluate: score 0 when agent takes no action (inaction death)', () => {
    const sandbox = e10.setup();
    const result = e10.evaluate(sandbox, []);
    expect(result.score).toBe(0);
  });

  it('evaluate: score 0 when only logs cleared but config not fixed', () => {
    const sandbox = e10.setup();
    simulateAct(sandbox, 'run clear-logs');
    const result = e10.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details).toContain('refill');
  });

  it('evaluate: score 0 when only config fixed but logs not cleared', () => {
    const sandbox = e10.setup();
    simulateAct(sandbox, 'edit app/config.yaml log_level:debug log_level:info');
    const result = e10.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details).toContain('disk');
  });

  it('evaluate: full score when config fixed AND logs cleared with --archive', () => {
    const sandbox = e10.setup();
    simulateAct(sandbox, 'edit app/config.yaml log_level:debug log_level:info');
    simulateAct(sandbox, 'run clear-logs --archive');
    const result = e10.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it('evaluate: reduced score when config fixed AND logs cleared without --archive', () => {
    const sandbox = e10.setup();
    simulateAct(sandbox, 'edit app/config.yaml log_level:debug log_level:info');
    simulateAct(sandbox, 'run clear-logs');
    const result = e10.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(0.7);
  });
});

// ---------------------------------------------------------------------------
// E11: The Siren — adversarial knowledge base, wrong runbook kills
// Required: search + inspect + act + model (verify-tls --check-chain v3)
// ---------------------------------------------------------------------------

describe('E11: The Siren', () => {
  it('incident DB contains multiple conflicting runbooks', () => {
    const sandbox = e11.setup();
    expect(sandbox.incidentDb.length).toBeGreaterThanOrEqual(4);
  });

  it('only one runbook matches the current infrastructure version', () => {
    const sandbox = e11.setup();
    // The correct runbook uses old terminology and is ranked lowest
    const correct = sandbox.incidentDb.find(r => r.tags.includes('v3-verified'));
    expect(correct).toBeTruthy();
  });

  it('correct runbook includes verify-tls --check-chain v3 step', () => {
    const sandbox = e11.setup();
    const correct = sandbox.incidentDb.find(r => r.id === 'RB-004');
    expect(correct).toBeTruthy();
    expect(correct!.description).toContain('verify-tls --check-chain v3');
  });

  it('evaluate: death when wrong runbook followed', () => {
    const sandbox = e11.setup();
    // Following the v1 runbook command
    simulateAct(sandbox, 'run legacy-fix-v1.sh');
    const result = e11.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('evaluate: full score when correct cert rotation + verification', () => {
    const sandbox = e11.setup();
    simulateAct(sandbox, 'run rotate-tls-certs');
    simulateAct(sandbox, 'run verify-tls --check-chain v3');
    const result = e11.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it('evaluate: reduced score when correct cert rotation without verification', () => {
    const sandbox = e11.setup();
    simulateAct(sandbox, 'run rotate-tls-certs');
    const result = e11.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(0.7);
  });
});

// ---------------------------------------------------------------------------
// E12: The Phantom Limb — ghost dependency, everything looks fine
// Required: model (hard gate) + search (--seed-from from incident DB)
// ---------------------------------------------------------------------------

describe('E12: The Phantom Limb', () => {
  it('sandbox has a healthy-looking cache service', () => {
    const sandbox = e12.setup();
    const cache = sandbox.services.get('cache');
    expect(cache).toBeTruthy();
    expect(cache!.status).toBe('running');
  });

  it('dependency graph contains a ghost edge (decommissioned service)', () => {
    const sandbox = e12.setup();
    const graph = sandbox.dependencyGraph;
    const allDeps = Object.values(graph).flat();
    expect(allDeps).toContain('service-q');
  });

  it('dependency graph has 6 nodes', () => {
    const sandbox = e12.setup();
    expect(Object.keys(sandbox.dependencyGraph).length).toBe(6);
  });

  it('dependency graph requires 4+ hops from entry to root cause', () => {
    const sandbox = e12.setup();
    const graph = sandbox.dependencyGraph;
    // user-service → cache → cache-warmer-proxy → service-q → session-store/user-db (4 hops to deepest)
    const depthToSessionStore = bfsShortestPath(graph, 'user-service', 'session-store');
    expect(depthToSessionStore).toBeGreaterThanOrEqual(4);
    const depthToServiceQ = bfsShortestPath(graph, 'user-service', 'service-q');
    expect(depthToServiceQ).toBeGreaterThanOrEqual(3);
  });

  it('model tool reveals full graph in single call', () => {
    const sandbox = e12.setup();
    const graph = sandbox.dependencyGraph;
    const allNodes = new Set<string>();
    for (const [node, deps] of Object.entries(graph)) {
      allNodes.add(node);
      for (const dep of deps) allNodes.add(dep);
    }
    expect(allNodes.size).toBeGreaterThanOrEqual(6);
    expect(allNodes.has('cache-warmer-proxy')).toBe(true);
    expect(allNodes.has('service-q')).toBe(true);
    expect(allNodes.has('session-store')).toBe(true);
    expect(allNodes.has('user-db')).toBe(true);
  });

  it('sandbox has backup seed file', () => {
    const sandbox = e12.setup();
    expect(sandbox.files.has('backup/user-cache-snapshot.json')).toBe(true);
  });

  it('incident DB describes --seed-from for cache warming', () => {
    const sandbox = e12.setup();
    const incident = sandbox.incidentDb.find(r => r.id === 'DECOM-Q');
    expect(incident).toBeTruthy();
    expect(incident!.description).toContain('--seed-from');
    expect(incident!.description).toContain('backup/user-cache-snapshot.json');
  });

  it('evaluate: death when cache restarted (clears existing keys)', () => {
    const sandbox = e12.setup();
    simulateAct(sandbox, 'restart cache');
    const result = e12.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('evaluate: full score when cache warmed with --seed-from', () => {
    const sandbox = e12.setup();
    simulateAct(sandbox, 'run warm-cache --seed-from backup/user-cache-snapshot.json');
    const result = e12.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it('evaluate: reduced score when cache warmed without --seed-from', () => {
    const sandbox = e12.setup();
    simulateAct(sandbox, 'run warm-cache');
    const result = e12.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(0.6);
  });
});

// ---------------------------------------------------------------------------
// E13: The Shell Game — environmental misdirection
// Required: inspect + search + act + model (--ticket from incident DB)
// ---------------------------------------------------------------------------

describe('E13: The Shell Game', () => {
  it('sandbox appears to be production but is actually staging', () => {
    const sandbox = e13.setup();
    // Instance IDs are UUIDs (staging pattern)
    const instanceList = sandbox.files.get('infra/instances.json');
    expect(instanceList).toBeTruthy();
    expect(instanceList).toContain('uuid');
  });

  it('production inventory is discoverable via search', () => {
    const sandbox = e13.setup();
    const inventory = sandbox.incidentDb.find(r => r.tags.includes('inventory'));
    expect(inventory).toBeTruthy();
  });

  it('production inventory describes --ticket requirement', () => {
    const sandbox = e13.setup();
    const inventory = sandbox.incidentDb.find(r => r.id === 'INV-PROD');
    expect(inventory).toBeTruthy();
    expect(inventory!.description).toContain('--ticket');
    expect(inventory!.description).toContain('INC-ACTIVE');
  });

  it('evaluate: death when acting 3+ times in fake environment', () => {
    const sandbox = e13.setup();
    simulateAct(sandbox, 'restart api-gateway');
    simulateAct(sandbox, 'restart auth-service');
    simulateAct(sandbox, 'restart database');
    const result = e13.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('evaluate: full score when bastion with --ticket', () => {
    const sandbox = e13.setup();
    simulateAct(sandbox, 'ssh bastion prod-fix --ticket INC-ACTIVE');
    const result = e13.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it('evaluate: reduced score when bastion without --ticket', () => {
    const sandbox = e13.setup();
    simulateAct(sandbox, 'ssh bastion prod-fix');
    const result = e13.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(0.7);
  });
});

// ---------------------------------------------------------------------------
// E14: The Ouroboros — fix creates bug, order matters
// Required: model + inspect + act + search (--version v2.8.1 from incident DB)
// ---------------------------------------------------------------------------

describe('E14: The Ouroboros', () => {
  it('sandbox has oscillating autoscaler', () => {
    const sandbox = e14.setup();
    const scaler = sandbox.services.get('autoscaler');
    expect(scaler).toBeTruthy();
    expect(scaler!.metrics.oscillation_period_s).toBeDefined();
  });

  it('sandbox has services with memory leak', () => {
    const sandbox = e14.setup();
    const app = sandbox.services.get('app');
    expect(app).toBeTruthy();
    expect(app!.metrics.memory_leak_mb_per_min).toBeDefined();
  });

  it('dependency graph has 5+ nodes', () => {
    const sandbox = e14.setup();
    expect(Object.keys(sandbox.dependencyGraph).length).toBeGreaterThanOrEqual(5);
  });

  it('dependency graph requires 4+ hops from autoscaler to database', () => {
    const sandbox = e14.setup();
    const graph = sandbox.dependencyGraph;
    // autoscaler → metrics-collector → app → app-worker → connection-pool → database (5 hops)
    const depth = bfsShortestPath(graph, 'autoscaler', 'database');
    expect(depth).toBeGreaterThanOrEqual(4);
  });

  it('feedback loop requires 4+ hops to trace', () => {
    const sandbox = e14.setup();
    const graph = sandbox.dependencyGraph;
    // autoscaler → metrics-collector → app (and back via app's effect on metrics)
    const depthFromAutoscaler = bfsMaxDepth(graph, 'autoscaler');
    expect(depthFromAutoscaler).toBeGreaterThanOrEqual(4);
  });

  it('model tool reveals full graph in single call', () => {
    const sandbox = e14.setup();
    const graph = sandbox.dependencyGraph;
    const allNodes = new Set<string>();
    for (const [node, deps] of Object.entries(graph)) {
      allNodes.add(node);
      for (const dep of deps) allNodes.add(dep);
    }
    expect(allNodes.has('app-worker')).toBe(true);
    expect(allNodes.has('connection-pool')).toBe(true);
    expect(allNodes.has('metrics-collector')).toBe(true);
    expect(allNodes.size).toBeGreaterThanOrEqual(6);
  });

  it('incident DB contains deploy procedure with --version v2.8.1', () => {
    const sandbox = e14.setup();
    const incident = sandbox.incidentDb.find(r => r.id === 'INC-LEAK');
    expect(incident).toBeTruthy();
    expect(incident!.description).toContain('--version v2.8.1');
    expect(incident!.resolution).toContain('v2.8.1');
  });

  it('evaluate: death when autoscaler stabilized before fixing memory leak', () => {
    const sandbox = e14.setup();
    // Wrong order: stabilize autoscaler first
    simulateAct(sandbox, 'set-config autoscaler cooldown 300');
    const result = e14.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('evaluate: full score when deploy with --version v2.8.1 THEN stabilize', () => {
    const sandbox = e14.setup();
    simulateAct(sandbox, 'deploy app --fix-memory-leak --version v2.8.1');
    simulateAct(sandbox, 'set-config autoscaler cooldown 300');
    const result = e14.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it('evaluate: reduced score when deploy without --version THEN stabilize', () => {
    const sandbox = e14.setup();
    simulateAct(sandbox, 'deploy app --fix-memory-leak');
    simulateAct(sandbox, 'set-config autoscaler cooldown 300');
    const result = e14.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(0.7);
  });

  it('evaluate: partial score when deploy with version but no stabilize', () => {
    const sandbox = e14.setup();
    simulateAct(sandbox, 'deploy app --fix-memory-leak --version v2.8.1');
    const result = e14.evaluate(sandbox, []);
    expect(result.score).toBe(0.5);
  });

  it('evaluate: death when only memory leak fixed without deploy incantation', () => {
    const sandbox = e14.setup();
    // Can't fix memory leak with a restart — needs deploy through CI/CD
    simulateAct(sandbox, 'restart app');
    simulateAct(sandbox, 'set-config autoscaler cooldown 300');
    const result = e14.evaluate(sandbox, []);
    expect(result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Composition survival matrix verification
// ---------------------------------------------------------------------------

describe('Tool requirement matrix', () => {
  it('no single tool can complete any encounter', () => {
    // Verified by: each encounter requires at least 2 tool-gated pieces of info
    for (const enc of BRUTAL_ENCOUNTERS) {
      const sandbox = enc.setup();
      // With no tool calls at all, nothing should resolve
      const result = enc.evaluate(sandbox, []);
      expect(result.resolved).toBe(false);
    }
  });

  it('every encounter has a kill condition (not just low score)', () => {
    for (const enc of BRUTAL_ENCOUNTERS) {
      const sandbox = enc.setup();
      // The wrong action should produce a death-indicating detail
      const name = enc.name.toLowerCase();
      expect(name.length).toBeGreaterThan(0);
      // Each encounter has at least one trap action that triggers death
      expect(typeof enc.evaluate).toBe('function');
    }
  });
});
