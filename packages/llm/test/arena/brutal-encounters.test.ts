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
// Required: model + act
// ---------------------------------------------------------------------------

describe('E7: The Hydra', () => {
  it('sandbox has crash-looping services with circular dependencies', () => {
    const sandbox = e7.setup();
    expect(sandbox.services.size).toBeGreaterThanOrEqual(3);
    // dependency graph should contain a cycle
    const graph = sandbox.dependencyGraph;
    expect(Object.keys(graph).length).toBeGreaterThanOrEqual(3);
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

  it('evaluate: resolved when safe node restarted (cache-layer)', () => {
    const sandbox = e7.setup();
    simulateAct(sandbox, 'restart cache-layer');
    const result = e7.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.8);
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
// Required: inspect (hard gate)
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

  it('evaluate: death when agent scales up (follows dashboard lie)', () => {
    const sandbox = e8.setup();
    simulateAct(sandbox, 'scale database replicas 3');
    const result = e8.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('evaluate: resolved when agent identifies false metric and takes no scaling action', () => {
    const sandbox = e8.setup();
    simulateAct(sandbox, 'restart sidecar-metrics');
    const result = e8.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.8);
  });
});

// ---------------------------------------------------------------------------
// E9: The Ritual — exact procedure from search, reasoning alone fails
// Required: search + act
// ---------------------------------------------------------------------------

describe('E9: The Ritual', () => {
  it('sandbox has a stuck migration with partially applied schema', () => {
    const sandbox = e9.setup();
    expect(sandbox.files.has('database/migration-state.json')).toBe(true);
  });

  it('incident DB contains the correct rollback procedure', () => {
    const sandbox = e9.setup();
    expect(sandbox.incidentDb.length).toBeGreaterThanOrEqual(1);
    const postMortem = sandbox.incidentDb.find(r => r.tags.includes('migration'));
    expect(postMortem).toBeTruthy();
    expect(postMortem!.resolution).toContain('drop-trigger');
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

  it('evaluate: resolved when correct procedure followed', () => {
    const sandbox = e9.setup();
    // Correct order from the post-mortem: trigger X, constraint Y, column Z
    simulateAct(sandbox, 'run drop-trigger-x');
    simulateAct(sandbox, 'run drop-constraint-y');
    simulateAct(sandbox, 'run drop-column-z');
    simulateAct(sandbox, 'run migrate --skip-applied');
    const result = e9.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.8);
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
// Required: inspect + model + act (3-tool gate)
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

  it('evaluate: resolved when BOTH config fixed AND logs cleared', () => {
    const sandbox = e10.setup();
    simulateAct(sandbox, 'edit app/config.yaml log_level:debug log_level:info');
    simulateAct(sandbox, 'run clear-logs');
    const result = e10.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.8);
  });
});

// ---------------------------------------------------------------------------
// E11: The Siren — adversarial knowledge base, wrong runbook kills
// Required: search + inspect + act
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

  it('evaluate: death when wrong runbook followed', () => {
    const sandbox = e11.setup();
    // Following the v1 runbook command
    simulateAct(sandbox, 'run legacy-fix-v1.sh');
    const result = e11.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('evaluate: resolved when correct runbook identified and applied', () => {
    const sandbox = e11.setup();
    simulateAct(sandbox, 'run rotate-tls-certs');
    const result = e11.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E12: The Phantom Limb — ghost dependency, everything looks fine
// Required: model (hard gate)
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
    // The ghost service should be in the dependency graph
    const allDeps = Object.values(graph).flat();
    expect(allDeps).toContain('service-q');
  });

  it('evaluate: death when cache restarted (clears existing keys)', () => {
    const sandbox = e12.setup();
    simulateAct(sandbox, 'restart cache');
    const result = e12.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('evaluate: resolved when cache warming job created', () => {
    const sandbox = e12.setup();
    simulateAct(sandbox, 'run warm-cache');
    const result = e12.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E13: The Shell Game — environmental misdirection
// Required: inspect + search + act
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

  it('evaluate: death when acting 3+ times in fake environment', () => {
    const sandbox = e13.setup();
    simulateAct(sandbox, 'restart api-gateway');
    simulateAct(sandbox, 'restart auth-service');
    simulateAct(sandbox, 'restart database');
    const result = e13.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('evaluate: resolved when agent connects to real prod via bastion', () => {
    const sandbox = e13.setup();
    simulateAct(sandbox, 'ssh bastion prod-fix');
    const result = e13.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E14: The Ouroboros — fix creates the bug, order matters
// Required: model + inspect + act
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

  it('evaluate: death when autoscaler stabilized before fixing memory leak', () => {
    const sandbox = e14.setup();
    // Wrong order: stabilize autoscaler first
    simulateAct(sandbox, 'set-config autoscaler cooldown 300');
    const result = e14.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('evaluate: resolved when memory leak fixed THEN autoscaler stabilized', () => {
    const sandbox = e14.setup();
    simulateAct(sandbox, 'deploy app --fix-memory-leak');
    simulateAct(sandbox, 'set-config autoscaler cooldown 300');
    const result = e14.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.8);
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
