/**
 * Integration tests for the evaluator redesign: epistemic keying, tripwires,
 * cascade scoring, and graph-distance.
 *
 * Thesis: search and model become load-bearing because evaluators reward
 * their use. Agents who skip epistemic tools get reduced scores.
 */

import { describe, it, expect } from 'vitest';
import { ENCOUNTERS } from '../../src/arena/encounters';
import { BRUTAL_ENCOUNTERS, e7, e8, e9, e10, e11, e12, e13, e14 } from '../../src/arena/brutal-encounters';
import { createSandboxTools } from '../../src/arena/sandbox-tools';
import { computeAgentFitness } from '../../src/arena/tournament/fitness';
import type { TaskResult } from '../../src/arena/tournament/types';
import type { Sandbox } from '../../src/arena/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function simulateActCommands(sandbox: Sandbox, commands: string[]): void {
  const tools = createSandboxTools(sandbox);
  const actTool = tools.find(t => t.name === 'act')!;
  for (const command of commands) {
    sandbox.commandLog.push(command);
    // Also execute through the tool for side effects (file edits, service restarts)
    const parts = command.split(' ');
    const verb = parts[0];
    if (verb === 'edit' && parts.length >= 4) {
      const path = parts[1];
      const oldStr = parts[2];
      const newStr = parts[3];
      const content = sandbox.files.get(path);
      if (content && content.includes(oldStr)) {
        sandbox.files.set(path, content.replaceAll(oldStr, newStr));
      }
    }
  }
}

function makeTaskResult(overrides: Partial<TaskResult> & { encounterId: string; score: number }): TaskResult {
  return {
    resolved: overrides.score >= 0.7,
    stepCount: 5,
    died: false,
    costEstimate: 0.01,
    collateral: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Keyed encounters reject act commands without correct values
// ---------------------------------------------------------------------------

describe('Epistemic keying', () => {
  describe('E1: The Silent Deployment', () => {
    it('without search key (no validate-schema CFG-042) scores 0.5', () => {
      const sandbox = ENCOUNTERS[0].setup();
      const config = sandbox.files.get('services/data-ingest/config.yaml')!;
      sandbox.files.set(
        'services/data-ingest/config.yaml',
        config.replace('data_source', 'datasource'),
      );
      sandbox.commandLog.push('restart data-ingest');

      const result = ENCOUNTERS[0].evaluate(sandbox, []);
      expect(result.score).toBe(0.5);
      expect(result.resolved).toBe(false);
      expect(result.partial).toBe(true);
    });

    it('with search key (validate-schema CFG-042) scores 1.0', () => {
      const sandbox = ENCOUNTERS[0].setup();
      const config = sandbox.files.get('services/data-ingest/config.yaml')!;
      sandbox.files.set(
        'services/data-ingest/config.yaml',
        config.replace('data_source', 'datasource'),
      );
      sandbox.commandLog.push('run validate-schema --config-hash CFG-042');
      sandbox.commandLog.push('restart data-ingest');

      const result = ENCOUNTERS[0].evaluate(sandbox, []);
      expect(result.score).toBe(1.0);
      expect(result.resolved).toBe(true);
    });
  });

  describe('E2: The Resource Contention', () => {
    it('without precedent (max_connections increase only) scores 0.7', () => {
      const sandbox = ENCOUNTERS[1].setup();
      const dbConfig = sandbox.files.get('database/config.yaml')!;
      sandbox.files.set(
        'database/config.yaml',
        dbConfig.replace('max_connections: 100', 'max_connections: 150'),
      );

      const result = ENCOUNTERS[1].evaluate(sandbox, []);
      expect(result.score).toBe(0.7);
      expect(result.resolved).toBe(true);
    });

    it('with precedent (pool_size 5 from INC-017) scores 1.0', () => {
      const sandbox = ENCOUNTERS[1].setup();
      const opConfig = sandbox.files.get('services/order-processor/config.yaml')!;
      sandbox.files.set(
        'services/order-processor/config.yaml',
        opConfig.replace('db_pool_size: 10', 'db_pool_size: 5'),
      );

      const result = ENCOUNTERS[1].evaluate(sandbox, []);
      expect(result.score).toBe(1.0);
      expect(result.resolved).toBe(true);
    });

    it('with precedent pooler command (pgbouncer --pool-mode) scores 1.0', () => {
      const sandbox = ENCOUNTERS[1].setup();
      sandbox.commandLog.push('run add-pgbouncer --pool-mode transaction');

      const result = ENCOUNTERS[1].evaluate(sandbox, []);
      expect(result.score).toBe(1.0);
      expect(result.resolved).toBe(true);
    });
  });

  describe('E4: The Cascading Failure', () => {
    it('without verify flag (backfill + all restarts) scores 0.7', () => {
      const sandbox = ENCOUNTERS[3].setup();
      sandbox.commandLog.push('run backfill');
      sandbox.commandLog.push('restart notifications');
      sandbox.commandLog.push('restart user-profiles');
      sandbox.commandLog.push('restart search');

      const result = ENCOUNTERS[3].evaluate(sandbox, []);
      expect(result.score).toBe(0.7);
    });

    it('with verify flag (backfill --batch-size --verify + all restarts) scores 1.0', () => {
      const sandbox = ENCOUNTERS[3].setup();
      sandbox.commandLog.push('run backfill --batch-size 1000 --verify');
      sandbox.commandLog.push('restart notifications');
      sandbox.commandLog.push('restart user-profiles');
      sandbox.commandLog.push('restart search');

      const result = ENCOUNTERS[3].evaluate(sandbox, []);
      expect(result.score).toBe(1.0);
      expect(result.resolved).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Tripwire encounters reject naive commands
// ---------------------------------------------------------------------------

describe('Tripwire encounters', () => {
  describe('E7: The Hydra', () => {
    it('restart cache-layer without --break-cycle scores 0.6', () => {
      const sandbox = e7.setup();
      sandbox.commandLog.push('restart cache-layer');

      const result = e7.evaluate(sandbox, []);
      expect(result.score).toBe(0.6);
      expect(result.resolved).toBe(true);
      expect(result.partial).toBe(true);
    });

    it('restart cache-layer with --break-cycle scores 1.0', () => {
      const sandbox = e7.setup();
      sandbox.commandLog.push('restart cache-layer --break-cycle');

      const result = e7.evaluate(sandbox, []);
      expect(result.score).toBe(1.0);
      expect(result.resolved).toBe(true);
      expect(result.partial).toBe(false);
    });
  });

  describe('E8: The Mimic', () => {
    it('restart metrics-agent without --recalibrate scores 0.5', () => {
      const sandbox = e8.setup();
      sandbox.commandLog.push('restart metrics-agent');

      const result = e8.evaluate(sandbox, []);
      expect(result.score).toBe(0.5);
      expect(result.resolved).toBe(true);
      expect(result.partial).toBe(true);
    });

    it('restart metrics-agent with --recalibrate scores 1.0', () => {
      const sandbox = e8.setup();
      sandbox.commandLog.push('restart metrics-agent --recalibrate');

      const result = e8.evaluate(sandbox, []);
      expect(result.score).toBe(1.0);
      expect(result.resolved).toBe(true);
    });
  });

  describe('E9: The Ritual', () => {
    it('correct order without --target scores 0.7 (times cascade multiplier)', () => {
      const sandbox = e9.setup();
      sandbox.commandLog.push('set-config orders-api maintenance_mode true');
      sandbox.commandLog.push('run drop-trigger-x');
      sandbox.commandLog.push('run drop-constraint-y');
      sandbox.commandLog.push('run drop-column-z');
      sandbox.commandLog.push('run drop-table audit_events');
      sandbox.commandLog.push('run migrate --skip-applied');

      const result = e9.evaluate(sandbox, []);
      // No --target => 0.7, maintenance_mode set before drops => no cascade penalty
      expect(result.score).toBe(0.7);
      expect(result.resolved).toBe(true);
      expect(result.partial).toBe(true);
    });

    it('correct order with --target orders-primary scores 1.0', () => {
      const sandbox = e9.setup();
      sandbox.commandLog.push('set-config orders-api maintenance_mode true');
      sandbox.commandLog.push('run drop-trigger-x');
      sandbox.commandLog.push('run drop-constraint-y');
      sandbox.commandLog.push('run drop-column-z');
      sandbox.commandLog.push('run drop-table audit_events');
      sandbox.commandLog.push('run migrate --skip-applied --target orders-primary');

      const result = e9.evaluate(sandbox, []);
      expect(result.score).toBe(1.0);
      expect(result.resolved).toBe(true);
    });
  });

  describe('E11: The Siren', () => {
    it('rotate-tls-certs without verify-tls scores 0.7', () => {
      const sandbox = e11.setup();
      sandbox.commandLog.push('run rotate-tls-certs --v3 --internal');

      const result = e11.evaluate(sandbox, []);
      expect(result.score).toBe(0.7);
      expect(result.resolved).toBe(true);
      expect(result.partial).toBe(true);
    });

    it('rotate-tls-certs with verify-tls --check-chain v3 scores 1.0', () => {
      const sandbox = e11.setup();
      sandbox.commandLog.push('run rotate-tls-certs --v3 --internal');
      sandbox.commandLog.push('run verify-tls --check-chain v3');

      const result = e11.evaluate(sandbox, []);
      expect(result.score).toBe(1.0);
      expect(result.resolved).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Cascade scoring produces lower fitness
// ---------------------------------------------------------------------------

describe('Cascade scoring penalties', () => {
  describe('E2: pool_size < 3 cascade penalty', () => {
    it('pool_size 2 triggers cascade penalty (0.7 multiplier)', () => {
      const sandbox = ENCOUNTERS[1].setup();
      const opConfig = sandbox.files.get('services/order-processor/config.yaml')!;
      sandbox.files.set(
        'services/order-processor/config.yaml',
        opConfig.replace('db_pool_size: 10', 'db_pool_size: 2'),
      );

      const result = ENCOUNTERS[1].evaluate(sandbox, []);
      // pool_size=2 < 3 triggers cascade, but 2*8=16+15+5=36 < 100 so resolved
      // Without precedent => 0.7, with cascade => 0.7 * 0.7 = 0.49
      expect(result.score).toBe(0.7 * 0.7);
    });

    it('pool_size 5 (precedent) with no cascade scores 1.0', () => {
      const sandbox = ENCOUNTERS[1].setup();
      const opConfig = sandbox.files.get('services/order-processor/config.yaml')!;
      sandbox.files.set(
        'services/order-processor/config.yaml',
        opConfig.replace('db_pool_size: 10', 'db_pool_size: 5'),
      );

      const result = ENCOUNTERS[1].evaluate(sandbox, []);
      // pool_size=5 >= 3 so no cascade, used precedent => 1.0
      expect(result.score).toBe(1.0);
    });
  });

  describe('E9: drops without maintenance_mode cascade penalty', () => {
    it('drops without maintenance_mode get 0.7 cascade multiplier', () => {
      const sandbox = e9.setup();
      // No maintenance_mode before drops
      sandbox.commandLog.push('run drop-trigger-x');
      sandbox.commandLog.push('run drop-constraint-y');
      sandbox.commandLog.push('run drop-column-z');
      sandbox.commandLog.push('run drop-table audit_events');
      sandbox.commandLog.push('run migrate --skip-applied --target orders-primary');

      const result = e9.evaluate(sandbox, []);
      // Correct order + target but no maintenance_mode => cascade penalty
      expect(result.score).toBe(1.0 * 0.7);
    });

    it('drops with maintenance_mode set first get no cascade penalty', () => {
      const sandbox = e9.setup();
      sandbox.commandLog.push('set-config orders-api maintenance_mode true');
      sandbox.commandLog.push('run drop-trigger-x');
      sandbox.commandLog.push('run drop-constraint-y');
      sandbox.commandLog.push('run drop-column-z');
      sandbox.commandLog.push('run drop-table audit_events');
      sandbox.commandLog.push('run migrate --skip-applied --target orders-primary');

      const result = e9.evaluate(sandbox, []);
      expect(result.score).toBe(1.0);
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Graph-distance: model is necessary for efficiency
// ---------------------------------------------------------------------------

describe('Graph-distance analysis', () => {
  function bfs(graph: Record<string, string[]>, start: string, target: string): number {
    const visited = new Set<string>();
    const queue: Array<{ node: string; depth: number }> = [{ node: start, depth: 0 }];

    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;
      if (node === target) return depth;
      if (visited.has(node)) continue;
      visited.add(node);

      const neighbors = graph[node] ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push({ node: neighbor, depth: depth + 1 });
        }
      }
    }
    return -1; // unreachable
  }

  function detectCycleLength(graph: Record<string, string[]>): number {
    // Find longest cycle in the graph using DFS
    let maxCycle = 0;

    for (const startNode of Object.keys(graph)) {
      const stack: Array<{ node: string; path: string[] }> = [{ node: startNode, path: [startNode] }];

      while (stack.length > 0) {
        const { node, path } = stack.pop()!;
        const neighbors = graph[node] ?? [];
        for (const neighbor of neighbors) {
          if (neighbor === startNode && path.length >= 2) {
            maxCycle = Math.max(maxCycle, path.length);
          } else if (!path.includes(neighbor)) {
            stack.push({ node: neighbor, path: [...path, neighbor] });
          }
        }
      }
    }

    return maxCycle;
  }

  describe('E7: The Hydra — circular dependency cycle', () => {
    it('dependency graph has a cycle of 5+ hops', () => {
      const sandbox = e7.setup();
      const graph = sandbox.dependencyGraph;
      const cycleLen = detectCycleLength(graph);
      expect(cycleLen).toBeGreaterThanOrEqual(5);
    });

    it('path from service-a to cache-layer is >= 2 hops', () => {
      const sandbox = e7.setup();
      const dist = bfs(sandbox.dependencyGraph, 'service-a', 'cache-layer');
      expect(dist).toBeGreaterThanOrEqual(2);
    });
  });

  describe('E12: The Phantom Limb — ghost dependency depth', () => {
    it('path from user-service to deepest node (session-store or user-db) is 4+ hops', () => {
      const sandbox = e12.setup();
      const graph = sandbox.dependencyGraph;

      const toSessionStore = bfs(graph, 'user-service', 'session-store');
      const toUserDb = bfs(graph, 'user-service', 'user-db');
      const deepest = Math.max(toSessionStore, toUserDb);

      expect(deepest).toBeGreaterThanOrEqual(4);
    });

    it('ghost dependency (service-q) is 3 hops from user-service', () => {
      const sandbox = e12.setup();
      const dist = bfs(sandbox.dependencyGraph, 'user-service', 'service-q');
      expect(dist).toBe(3);
    });
  });

  describe('E14: The Ouroboros — feedback loop depth', () => {
    it('autoscaler to app through metrics-collector is >= 2 hops', () => {
      const sandbox = e14.setup();
      const dist = bfs(sandbox.dependencyGraph, 'autoscaler', 'app');
      expect(dist).toBeGreaterThanOrEqual(2);
    });

    it('full causal chain (app -> app-worker -> connection-pool -> ...) is 3+ hops', () => {
      const sandbox = e14.setup();
      const graph = sandbox.dependencyGraph;

      // app -> app-worker -> connection-pool -> database/cache
      const toDatabase = bfs(graph, 'app', 'database');
      expect(toDatabase).toBeGreaterThanOrEqual(3);
    });

    it('feedback loop exists: autoscaler -> metrics-collector -> app -> ...', () => {
      const sandbox = e14.setup();
      const graph = sandbox.dependencyGraph;

      // autoscaler -> metrics-collector -> app -> app-worker -> connection-pool
      // and metrics-collector -> app creates the feedback
      const autoscalerToApp = bfs(graph, 'autoscaler', 'app');
      expect(autoscalerToApp).toBeGreaterThanOrEqual(2);

      // app -> ... -> connection-pool chain
      const appToPool = bfs(graph, 'app', 'connection-pool');
      expect(appToPool).toBeGreaterThanOrEqual(2);
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Fitness comparison: epistemic agent vs naive agent
// ---------------------------------------------------------------------------

describe('Fitness comparison: epistemic vs naive agent', () => {
  it('epistemic agent (search+model+keyed actions) outscores naive agent (inspect+act only)', () => {
    // Naive agent: fixes problems correctly but without epistemic keys/tripwires
    const naiveResults: TaskResult[] = [
      makeTaskResult({ encounterId: 'e1', score: 0.5 }),   // config fixed, restarted, no schema validation
      makeTaskResult({ encounterId: 'e2', score: 0.7 }),   // increased max_connections, no precedent
      makeTaskResult({ encounterId: 'e4', score: 0.7 }),   // backfill without --verify
      makeTaskResult({ encounterId: 'e7', score: 0.6 }),   // restarted cache-layer, no --break-cycle
      makeTaskResult({ encounterId: 'e8', score: 0.5 }),   // restarted metrics-agent, no --recalibrate
      makeTaskResult({ encounterId: 'e9', score: 0.7 * 0.7 }),  // correct order, --target, no maintenance_mode
      makeTaskResult({ encounterId: 'e11', score: 0.7 }),  // rotate-tls-certs, no verify
    ];

    // Epistemic agent: uses search and model to find keyed values and tripwire flags
    const epistemicResults: TaskResult[] = [
      makeTaskResult({ encounterId: 'e1', score: 1.0 }),   // config fixed + validate-schema CFG-042 + restart
      makeTaskResult({ encounterId: 'e2', score: 1.0 }),   // pool_size=5 from INC-017 precedent
      makeTaskResult({ encounterId: 'e4', score: 1.0 }),   // backfill --batch-size 1000 --verify + all restarts
      makeTaskResult({ encounterId: 'e7', score: 1.0 }),   // cache-layer --break-cycle
      makeTaskResult({ encounterId: 'e8', score: 1.0 }),   // metrics-agent --recalibrate
      makeTaskResult({ encounterId: 'e9', score: 1.0 }),   // correct order + --target + maintenance_mode
      makeTaskResult({ encounterId: 'e11', score: 1.0 }),  // rotate-tls-certs + verify-tls --check-chain v3
    ];

    const naiveFitness = computeAgentFitness('naive-agent', naiveResults);
    const epistemicFitness = computeAgentFitness('epistemic-agent', epistemicResults);

    expect(epistemicFitness.fitnessScore).toBeGreaterThan(naiveFitness.fitnessScore);

    // Verify the score gap is meaningful (not just rounding)
    const scoreDelta = epistemicFitness.metrics.meanScore - naiveFitness.metrics.meanScore;
    expect(scoreDelta).toBeGreaterThan(0.2);

    // Epistemic agent should have higher completion rate
    expect(epistemicFitness.metrics.completionRate).toBeGreaterThanOrEqual(
      naiveFitness.metrics.completionRate,
    );
  });

  it('dead naive agent (wrong actions) has dramatically lower fitness', () => {
    // Agent that takes wrong actions and dies on brutal encounters
    const deadResults: TaskResult[] = [
      makeTaskResult({ encounterId: 'e7', score: 0, died: true, collateral: 1.0 }),  // blind restarts
      makeTaskResult({ encounterId: 'e8', score: 0, died: true, collateral: 1.0 }),  // scaled up on false metric
      makeTaskResult({ encounterId: 'e9', score: 0, died: true, collateral: 1.0 }),  // wrong drop order
      makeTaskResult({ encounterId: 'e11', score: 0, died: true, collateral: 1.0 }), // ran v1 fix on v3
      makeTaskResult({ encounterId: 'e12', score: 0, died: true, collateral: 1.0 }), // restarted cache
    ];

    const epistemicResults: TaskResult[] = [
      makeTaskResult({ encounterId: 'e7', score: 1.0 }),
      makeTaskResult({ encounterId: 'e8', score: 1.0 }),
      makeTaskResult({ encounterId: 'e9', score: 1.0 }),
      makeTaskResult({ encounterId: 'e11', score: 1.0 }),
      makeTaskResult({ encounterId: 'e12', score: 1.0 }),
    ];

    const deadFitness = computeAgentFitness('dead-agent', deadResults);
    const epistemicFitness = computeAgentFitness('epistemic-agent', epistemicResults);

    expect(epistemicFitness.fitnessScore).toBeGreaterThan(deadFitness.fitnessScore * 3);
    expect(deadFitness.metrics.survivalRate).toBe(0);
    expect(epistemicFitness.metrics.survivalRate).toBe(1);
  });

  it('mixed agent (some epistemic, some naive) falls between extremes', () => {
    const mixedResults: TaskResult[] = [
      makeTaskResult({ encounterId: 'e1', score: 1.0 }),   // used search key
      makeTaskResult({ encounterId: 'e2', score: 0.7 }),   // no precedent
      makeTaskResult({ encounterId: 'e7', score: 1.0 }),   // used --break-cycle
      makeTaskResult({ encounterId: 'e8', score: 0.5 }),   // no --recalibrate
      makeTaskResult({ encounterId: 'e9', score: 0.7 * 0.7 }), // cascade penalty
    ];

    const naiveResults: TaskResult[] = [
      makeTaskResult({ encounterId: 'e1', score: 0.5 }),
      makeTaskResult({ encounterId: 'e2', score: 0.7 }),
      makeTaskResult({ encounterId: 'e7', score: 0.6 }),
      makeTaskResult({ encounterId: 'e8', score: 0.5 }),
      makeTaskResult({ encounterId: 'e9', score: 0.7 * 0.7 }),
    ];

    const epistemicResults: TaskResult[] = [
      makeTaskResult({ encounterId: 'e1', score: 1.0 }),
      makeTaskResult({ encounterId: 'e2', score: 1.0 }),
      makeTaskResult({ encounterId: 'e7', score: 1.0 }),
      makeTaskResult({ encounterId: 'e8', score: 1.0 }),
      makeTaskResult({ encounterId: 'e9', score: 1.0 }),
    ];

    const naiveFitness = computeAgentFitness('naive', naiveResults);
    const mixedFitness = computeAgentFitness('mixed', mixedResults);
    const epistemicFitness = computeAgentFitness('epistemic', epistemicResults);

    expect(mixedFitness.fitnessScore).toBeGreaterThan(naiveFitness.fitnessScore);
    expect(epistemicFitness.fitnessScore).toBeGreaterThan(mixedFitness.fitnessScore);
  });
});
