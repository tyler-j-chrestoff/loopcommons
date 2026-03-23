import { describe, it, expect } from 'vitest';
import { generateFamily, type VarianceSpec } from '../../../src/arena/encounter-family';
import { compileEncounter, type EncounterYaml } from '../../../src/arena/encounter-dsl';
import {
  computeConsistencyScore,
  applyConsistencyBonus,
  type FamilyScores,
} from '../../../src/arena/tournament/consistency-scoring';
import {
  createAnchor,
  verifyAnchor,
  detectDivergence,
} from '../../../src/arena/tournament/anchor-protocol';
import { computeAgentFitness } from '../../../src/arena/tournament/fitness';
import type { TaskResult } from '../../../src/arena/tournament/types';

// ---------------------------------------------------------------------------
// Fixture: encounter family for integration test
// ---------------------------------------------------------------------------

function makeBaseYaml(): EncounterYaml {
  return {
    id: 'int-1',
    name: 'Config Drift',
    sandbox: {
      files: {
        'services/auth-svc/config.yaml': 'timeout: 30\nretries: 3',
      },
      services: {
        'auth-svc': {
          status: 'degraded',
          config: { timeout: '30', retries: '3' },
          metrics: { error_rate: 0.15, latency_ms: 2000 },
          logs: ['Request timeout after 30s'],
        },
      },
      incidents: [
        {
          id: 'INC-300',
          title: 'Auth timeout under load',
          description: 'auth-svc timeout was 30, reducing to 5 with retries=10 fixed it.',
          resolution: 'Set timeout=5, retries=10, restart auth-svc',
          tags: ['auth-svc', 'timeout'],
        },
      ],
      dependencyGraph: { 'auth-svc': [] },
    },
    prompt: 'auth-svc is timing out under load. Error rate is 15%. Investigate.',
    scoring: [
      {
        condition: "fileContains('services/auth-svc/config.yaml', 'timeout: 5') && fileContains('services/auth-svc/config.yaml', 'retries: 10') && commandMatches('restart auth-svc')",
        score: 1.0,
        resolved: true,
        partial: false,
        details: 'Fixed timeout and retries, restarted auth-svc',
      },
      {
        condition: "fileContains('services/auth-svc/config.yaml', 'timeout: 5')",
        score: 0.4,
        resolved: false,
        partial: true,
        details: 'Fixed timeout only',
      },
    ],
    epistemicKeys: { search: 'INC-300 timeout precedent' },
  };
}

function makeVariants(): VarianceSpec[] {
  return [
    {
      substitutions: [
        { from: 'auth-svc', to: 'gateway-svc' },
        { from: 'INC-300', to: 'INC-401' },
        { from: 'Auth timeout', to: 'Gateway timeout' },
      ],
      idSuffix: 'gw',
      nameSuffix: '(Gateway)',
    },
    {
      substitutions: [
        { from: 'auth-svc', to: 'payment-svc' },
        { from: 'INC-300', to: 'INC-502' },
        { from: 'Auth timeout', to: 'Payment timeout' },
      ],
      idSuffix: 'pay',
      nameSuffix: '(Payment)',
    },
  ];
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('encounter family integration', () => {
  it('family members share structural identity: same fix → same score', () => {
    const family = generateFamily(makeBaseYaml(), makeVariants());
    const allMembers = [family.base, ...family.variants];

    const scores: number[] = [];
    for (const member of allMembers) {
      const compiled = compileEncounter(member);
      const sandbox = compiled.setup();

      // Apply the structural fix: timeout: 5, retries: 10, restart the service
      const serviceName = member.id === 'int-1'
        ? 'auth-svc'
        : member.id === 'int-1-gw'
          ? 'gateway-svc'
          : 'payment-svc';

      const configPath = `services/${serviceName}/config.yaml`;
      sandbox.files.set(configPath, 'timeout: 5\nretries: 10');
      sandbox.commandLog.push(`restart ${serviceName}`);

      const result = compiled.evaluate(sandbox, []);
      scores.push(result.score);
    }

    // All members should score 1.0
    expect(scores).toEqual([1.0, 1.0, 1.0]);
  });

  it('consistent agent gets consistency bonus', () => {
    const familyScores: FamilyScores = {
      familyId: 'int-1',
      scores: [1.0, 1.0, 1.0],
    };
    const result = computeConsistencyScore(familyScores);
    expect(result.consistency).toBe(1.0);

    const baseFitness = 0.7;
    const adjusted = applyConsistencyBonus(baseFitness, [result]);
    expect(adjusted).toBeGreaterThan(baseFitness);
  });

  it('inconsistent agent gets consistency penalty', () => {
    const familyScores: FamilyScores = {
      familyId: 'int-1',
      scores: [1.0, 0.0, 0.4],
    };
    const result = computeConsistencyScore(familyScores);
    expect(result.consistency).toBeLessThan(0.5);

    const baseFitness = 0.7;
    const adjusted = applyConsistencyBonus(baseFitness, [result]);
    expect(adjusted).toBeLessThan(baseFitness);
  });

  it('transfer pressure: fitness includes family variant scores', () => {
    // Simulate agent that memorized base but fails variants
    const baseResult: TaskResult = {
      encounterId: 'int-1',
      resolved: true,
      score: 1.0,
      stepCount: 3,
      died: false,
      costEstimate: 0.001,
    };
    const variantResult1: TaskResult = {
      encounterId: 'int-1-gw',
      resolved: false,
      score: 0.0,
      stepCount: 10,
      died: true,
      costEstimate: 0.005,
    };
    const variantResult2: TaskResult = {
      encounterId: 'int-1-pay',
      resolved: false,
      score: 0.0,
      stepCount: 8,
      died: true,
      costEstimate: 0.004,
    };

    // Fitness with base only
    const fitnessBaseOnly = computeAgentFitness('agent-1', [baseResult]);
    // Fitness with family (base + variants)
    const fitnessWithFamily = computeAgentFitness('agent-1', [baseResult, variantResult1, variantResult2]);

    // Agent that only solves the base encounter gets lower fitness
    // when family variants are included in the task battery
    expect(fitnessWithFamily.fitnessScore).toBeLessThan(fitnessBaseOnly.fitnessScore);
    expect(fitnessWithFamily.metrics.completionRate).toBeCloseTo(1 / 3);
  });

  describe('anchor protocol end-to-end', () => {
    it('anchor is immutable: hash verification', () => {
      const family = generateFamily(makeBaseYaml(), makeVariants());
      const encounters = [family.base, ...family.variants].map(compileEncounter);

      const anchor = createAnchor(encounters, 'v1');
      expect(verifyAnchor(anchor).valid).toBe(true);

      // Tampering detection
      const tampered = { ...anchor, encounterIds: ['fake-id'] };
      expect(verifyAnchor(tampered).valid).toBe(false);
    });

    it('divergence detection flags potential collusion', () => {
      // Agent scores well on co-evolved encounters but poorly on anchor
      const anchorScores = new Map([
        ['int-1', 0.2],
        ['int-1-gw', 0.1],
        ['int-1-pay', 0.15],
      ]);
      const coevolvedScores = new Map([
        ['int-1', 0.9],
        ['int-1-gw', 0.85],
        ['int-1-pay', 0.88],
      ]);

      const result = detectDivergence(anchorScores, coevolvedScores, 0.3);
      expect(result.diverged).toBe(true);
      expect(result.gap).toBeGreaterThan(0.3);
    });

    it('no divergence when performance is consistent', () => {
      const anchorScores = new Map([
        ['int-1', 0.8],
        ['int-1-gw', 0.75],
      ]);
      const coevolvedScores = new Map([
        ['int-1', 0.82],
        ['int-1-gw', 0.78],
      ]);

      const result = detectDivergence(anchorScores, coevolvedScores, 0.1);
      expect(result.diverged).toBe(false);
    });
  });

  it('full pipeline: generate family → compile → evaluate → score consistency', () => {
    const family = generateFamily(makeBaseYaml(), makeVariants());
    const allMembers = [family.base, ...family.variants];

    // Simulate an agent that partially solves each variant
    const scores: number[] = allMembers.map((member, i) => {
      const compiled = compileEncounter(member);
      const sandbox = compiled.setup();

      // Only fix timeout (not retries, not restart) — partial score
      const serviceName = member.id === 'int-1'
        ? 'auth-svc'
        : member.id === 'int-1-gw'
          ? 'gateway-svc'
          : 'payment-svc';
      const configPath = `services/${serviceName}/config.yaml`;
      sandbox.files.set(configPath, 'timeout: 5\nretries: 3');

      return compiled.evaluate(sandbox, []).score;
    });

    // All should get partial score (0.4)
    expect(scores).toEqual([0.4, 0.4, 0.4]);

    const familyScores: FamilyScores = { familyId: 'int-1', scores };
    const consistency = computeConsistencyScore(familyScores);
    expect(consistency.consistency).toBe(1.0); // Perfectly consistent (all same score)
    expect(consistency.meanScore).toBeCloseTo(0.4);
  });
});
