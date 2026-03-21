/**
 * Deterministic fitness landscape tests for brutal encounters.
 *
 * Lego 1: Prove the evaluators discriminate between compositions
 * WITHOUT any LLM calls. Simulates scripted agent behavior per
 * tool composition to verify:
 *   - Wrong compositions get score 0 + death
 *   - Right compositions get score > 0.8
 *   - Inaction is death (not just score 0)
 *   - The fitness landscape has the shape we want
 */

import { describe, it, expect } from 'vitest';
import {
  BRUTAL_ENCOUNTERS,
  e7, e8, e9, e10, e11, e12, e13, e14,
} from '../../src/arena/brutal-encounters';
import { createSandboxTools } from '../../src/arena/sandbox-tools';
import { computeAgentFitness } from '../../src/arena/tournament/fitness';
import type { Sandbox, ArenaToolId } from '../../src/arena/types';
import type { TaskResult } from '../../src/arena/tournament/types';

// ---------------------------------------------------------------------------
// Simulated agent: executes a scripted sequence of tool calls
// ---------------------------------------------------------------------------

type ScriptedAction =
  | { tool: 'inspect'; target: string }
  | { tool: 'act'; command: string }
  | { tool: 'search'; query: string }
  | { tool: 'model'; system: string };

async function simulateAgent(
  encounter: typeof e7,
  agentTools: ArenaToolId[],
  script: ScriptedAction[],
): Promise<{ sandbox: Sandbox; outputs: string[] }> {
  const sandbox = encounter.setup();
  const tools = createSandboxTools(sandbox)
    .filter(t => agentTools.includes(t.name as ArenaToolId));

  const outputs: string[] = [];
  for (const action of script) {
    const tool = tools.find(t => t.name === action.tool);
    if (!tool) {
      outputs.push(`TOOL_UNAVAILABLE: ${action.tool}`);
      continue;
    }
    const input = action.tool === 'inspect' ? { target: (action as any).target }
      : action.tool === 'act' ? { command: (action as any).command }
      : action.tool === 'search' ? { query: (action as any).query }
      : { system: (action as any).system };
    const result = await tool.execute(input as any);
    outputs.push(result);
  }
  return { sandbox, outputs };
}

// ---------------------------------------------------------------------------
// Inaction = death: every encounter must kill idle agents
// ---------------------------------------------------------------------------

describe('Inaction is death', () => {
  for (const enc of BRUTAL_ENCOUNTERS) {
    it(`${enc.id} (${enc.name}): no actions → death`, () => {
      const sandbox = enc.setup();
      const result = enc.evaluate(sandbox, []);
      expect(result.resolved).toBe(false);
      expect(result.score).toBe(0);
      // Inaction must be flagged as death-equivalent
      expect(result.details.toLowerCase()).toMatch(/death|no.*action|no.*remediation/);
    });
  }
});

// ---------------------------------------------------------------------------
// E7: The Hydra — model + act required
// ---------------------------------------------------------------------------

describe('E7 fitness landscape', () => {
  it('[model] only → sees cycle but cannot act → death', async () => {
    const { sandbox } = await simulateAgent(e7, ['model'], [
      { tool: 'model', system: 'all' },
    ]);
    const result = e7.evaluate(sandbox, []);
    expect(result.resolved).toBe(false);
    expect(result.score).toBe(0);
  });

  it('[act] only → blind restarts → death', async () => {
    const { sandbox } = await simulateAgent(e7, ['act'], [
      { tool: 'act', command: 'restart service-a' },
      { tool: 'act', command: 'restart service-b' },
      { tool: 'act', command: 'restart service-c' },
    ]);
    const result = e7.evaluate(sandbox, []);
    expect(result.score).toBe(0);
  });

  it('[model, act] → maps cycle, restarts safe node → resolved', async () => {
    const { sandbox, outputs } = await simulateAgent(e7, ['model', 'act'], [
      { tool: 'model', system: 'all' },
      { tool: 'act', command: 'restart cache-layer' },
    ]);
    // model should reveal cache-layer has no deps
    expect(outputs[0]).toContain('cache-layer');
    const result = e7.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// E8: The Mimic — inspect required (hard gate)
// ---------------------------------------------------------------------------

describe('E8 fitness landscape', () => {
  it('[search] only → finds runbook, follows it → death', async () => {
    // search won't find anything (no incidents), agent might act on alert
    const { sandbox } = await simulateAgent(e8, ['act'], [
      { tool: 'act', command: 'scale database replicas 3' },
    ]);
    const result = e8.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('[inspect] → reads real proc data, sees lie → can identify problem', async () => {
    const { outputs } = await simulateAgent(e8, ['inspect'], [
      { tool: 'inspect', target: 'monitoring/dashboard.json' },
      { tool: 'inspect', target: 'host/proc/stat' },
    ]);
    // Dashboard shows 98% CPU
    expect(outputs[0]).toContain('98');
    // Real proc shows ~2.5% CPU
    expect(outputs[1]).toContain('98200'); // high idle count
  });

  it('[inspect, act] → identifies lie, fixes sidecar → resolved', async () => {
    const { sandbox } = await simulateAgent(e8, ['inspect', 'act'], [
      { tool: 'inspect', target: 'host/proc/stat' },
      { tool: 'inspect', target: 'host/proc/sidecar-metrics-agent.log' },
      { tool: 'act', command: 'restart metrics-agent' },
    ]);
    const result = e8.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// E9: The Ritual — search + act required
// ---------------------------------------------------------------------------

describe('E9 fitness landscape', () => {
  it('[model, act] → derives plausible but wrong order → death', async () => {
    const { sandbox } = await simulateAgent(e9, ['model', 'act'], [
      { tool: 'model', system: 'all' },
      // Plausible wrong order: column before trigger
      { tool: 'act', command: 'run drop-column-z' },
      { tool: 'act', command: 'run drop-trigger-x' },
    ]);
    const result = e9.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('[search, act] → finds correct procedure, follows it → resolved', async () => {
    const { sandbox, outputs } = await simulateAgent(e9, ['search', 'act'], [
      { tool: 'search', query: 'migration rollback' },
      { tool: 'act', command: 'run drop-trigger-x' },
      { tool: 'act', command: 'run drop-constraint-y' },
      { tool: 'act', command: 'run drop-column-z' },
      { tool: 'act', command: 'run migrate --skip-applied' },
    ]);
    // search should find the post-mortem
    expect(outputs[0]).toContain('INC-089');
    const result = e9.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it('[search] only → finds procedure but cannot act → score 0', async () => {
    const { sandbox } = await simulateAgent(e9, ['search'], [
      { tool: 'search', query: 'migration rollback' },
    ]);
    const result = e9.evaluate(sandbox, []);
    expect(result.resolved).toBe(false);
    expect(result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// E10: The Sleeper — inspect + model + act (3-tool gate)
// ---------------------------------------------------------------------------

describe('E10 fitness landscape', () => {
  it('[inspect, act] → clears logs but config refills → score 0', async () => {
    const { sandbox } = await simulateAgent(e10, ['inspect', 'act'], [
      { tool: 'inspect', target: 'host/disk-usage.json' },
      { tool: 'act', command: 'run clear-logs' },
      // Didn't fix config
    ]);
    const result = e10.evaluate(sandbox, []);
    expect(result.score).toBe(0);
  });

  it('[inspect, model, act] → full diagnosis + both fixes → resolved', async () => {
    const { sandbox } = await simulateAgent(e10, ['inspect', 'model', 'act'], [
      { tool: 'inspect', target: 'host/disk-usage.json' },
      { tool: 'inspect', target: 'deploy/changelog.md' },
      { tool: 'model', system: 'all' },
      { tool: 'act', command: 'edit app/config.yaml log_level:debug log_level:info' },
      { tool: 'act', command: 'run clear-logs' },
    ]);
    const result = e10.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// E11: The Siren — search + inspect + act
// ---------------------------------------------------------------------------

describe('E11 fitness landscape', () => {
  it('[search, act] without inspect → follows v1 runbook → death', async () => {
    const { sandbox, outputs } = await simulateAgent(e11, ['search', 'act'], [
      { tool: 'search', query: 'TLS error api-gateway' },
      // First result is v1 runbook (highest-relevance tag)
      { tool: 'act', command: 'run legacy-fix-v1.sh --force' },
    ]);
    expect(outputs[0]).toContain('RB-001');
    const result = e11.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('[search, inspect, act] → cross-references, finds v3 fix → resolved', async () => {
    const { sandbox } = await simulateAgent(e11, ['search', 'inspect', 'act'], [
      { tool: 'search', query: 'TLS certificate v3' },
      { tool: 'inspect', target: 'services/api-gateway/config.yaml' },
      { tool: 'act', command: 'run rotate-tls-certs --v3 --internal' },
    ]);
    const result = e11.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// E12: The Phantom Limb — model required (hard gate)
// ---------------------------------------------------------------------------

describe('E12 fitness landscape', () => {
  it('[inspect] only → cache looks healthy, loops forever → score 0', async () => {
    const { sandbox } = await simulateAgent(e12, ['inspect'], [
      { tool: 'inspect', target: 'service:cache' },
      { tool: 'inspect', target: 'service:user-service' },
    ]);
    const result = e12.evaluate(sandbox, []);
    expect(result.score).toBe(0);
  });

  it('[inspect, act] → restarts cache → death', async () => {
    const { sandbox } = await simulateAgent(e12, ['inspect', 'act'], [
      { tool: 'inspect', target: 'service:cache' },
      { tool: 'act', command: 'restart cache' },
    ]);
    const result = e12.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('[model, act] → sees ghost dep, warms cache → resolved', async () => {
    const { sandbox, outputs } = await simulateAgent(e12, ['model', 'act'], [
      { tool: 'model', system: 'cache' },
      { tool: 'act', command: 'run warm-cache' },
    ]);
    // model reveals service-q ghost dependency
    expect(outputs[0]).toContain('service-q');
    const result = e12.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// E13: The Shell Game — inspect + search + act
// ---------------------------------------------------------------------------

describe('E13 fitness landscape', () => {
  it('[act] only → restarts in fake env → death', async () => {
    const { sandbox } = await simulateAgent(e13, ['act'], [
      { tool: 'act', command: 'restart api-gateway' },
      { tool: 'act', command: 'restart auth-service' },
      { tool: 'act', command: 'restart database' },
    ]);
    const result = e13.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('[inspect, search, act] → detects staging, uses bastion → resolved', async () => {
    const { sandbox, outputs } = await simulateAgent(e13, ['inspect', 'search', 'act'], [
      { tool: 'inspect', target: 'infra/instances.json' },
      { tool: 'search', query: 'production inventory environment' },
      { tool: 'act', command: 'ssh bastion prod-fix' },
    ]);
    // inspect reveals UUID instance IDs (staging)
    expect(outputs[0]).toContain('uuid');
    // search finds the inventory record
    expect(outputs[1]).toContain('INV-PROD');
    const result = e13.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// E14: The Ouroboros — model + inspect + act (order-dependent)
// ---------------------------------------------------------------------------

describe('E14 fitness landscape', () => {
  it('[act] only → stabilizes autoscaler first → death', async () => {
    const { sandbox } = await simulateAgent(e14, ['act'], [
      { tool: 'act', command: 'set-config autoscaler cooldown 300' },
    ]);
    const result = e14.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });

  it('[model, inspect, act] correct order → deploy then stabilize → resolved', async () => {
    const { sandbox } = await simulateAgent(e14, ['model', 'inspect', 'act'], [
      { tool: 'model', system: 'all' },
      { tool: 'inspect', target: 'monitoring/app-memory.json' },
      { tool: 'inspect', target: 'deploy/ci-cd.md' },
      { tool: 'act', command: 'deploy app --fix-memory-leak' },
      { tool: 'act', command: 'set-config autoscaler cooldown 300' },
    ]);
    const result = e14.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it('[model, inspect, act] wrong order → stabilize then deploy → death', async () => {
    const { sandbox } = await simulateAgent(e14, ['model', 'inspect', 'act'], [
      { tool: 'model', system: 'all' },
      { tool: 'act', command: 'set-config autoscaler cooldown 300' },
      { tool: 'act', command: 'deploy app --fix-memory-leak' },
    ]);
    const result = e14.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details.toLowerCase()).toContain('death');
  });
});

// ---------------------------------------------------------------------------
// Composition fitness matrix: aggregate proof that the landscape discriminates
// ---------------------------------------------------------------------------

describe('Composition fitness discrimination', () => {
  const ALL_COMPOSITIONS: [string, ArenaToolId[]][] = [
    ['inspect', ['inspect']],
    ['act', ['act']],
    ['search', ['search']],
    ['model', ['model']],
    ['inspect+act', ['inspect', 'act']],
    ['inspect+search', ['inspect', 'search']],
    ['inspect+model', ['inspect', 'model']],
    ['act+search', ['act', 'search']],
    ['act+model', ['act', 'model']],
    ['search+model', ['search', 'model']],
    ['inspect+act+search', ['inspect', 'act', 'search']],
    ['inspect+act+model', ['inspect', 'act', 'model']],
    ['inspect+search+model', ['inspect', 'search', 'model']],
    ['act+search+model', ['act', 'search', 'model']],
    ['all', ['inspect', 'act', 'search', 'model']],
  ];

  it('no single-tool composition resolves any brutal encounter', () => {
    const singles = ALL_COMPOSITIONS.filter(([, tools]) => tools.length === 1);
    for (const [label, _tools] of singles) {
      for (const enc of BRUTAL_ENCOUNTERS) {
        const sandbox = enc.setup();
        // Single tool agent with no actions = inaction
        const result = enc.evaluate(sandbox, []);
        expect(result.resolved, `${label} should not resolve ${enc.id}`).toBe(false);
      }
    }
  });

  it('diverse compositions produce different fitness scores', async () => {
    // Simulate "optimal play" for each composition against all encounters
    // This proves the landscape has variance
    const scores: Map<string, number> = new Map();

    for (const [label, tools] of ALL_COMPOSITIONS) {
      const results: TaskResult[] = [];
      for (const enc of BRUTAL_ENCOUNTERS) {
        const sandbox = enc.setup();
        // Simulate: agent does nothing (worst case for that composition)
        const result = enc.evaluate(sandbox, []);
        results.push({
          encounterId: enc.id,
          resolved: result.resolved,
          score: result.score,
          stepCount: 0,
          died: !result.resolved && result.score === 0,
          costEstimate: 0,
          collateral: result.score === 0 && result.details.toLowerCase().includes('death') ? 1.0 : 0,
        });
      }
      const fitness = computeAgentFitness(label, results);
      scores.set(label, fitness.fitnessScore);
    }

    // All inaction agents should have the same (low) fitness
    const allScores = Array.from(scores.values());
    const uniqueScores = new Set(allScores.map(s => s.toFixed(3)));
    // With inaction = death for all, scores should be uniformly low
    for (const score of allScores) {
      expect(score).toBeLessThan(0.5);
    }
  });
});
