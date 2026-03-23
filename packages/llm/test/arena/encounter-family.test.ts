import { describe, it, expect } from 'vitest';
import {
  generateFamily,
  type VarianceSpec,
  type EncounterFamily,
} from '../../src/arena/encounter-family';
import { compileEncounter, type EncounterYaml } from '../../src/arena/encounter-dsl';

// ---------------------------------------------------------------------------
// Fixture: a minimal DSL encounter with services, files, incidents, scoring
// ---------------------------------------------------------------------------

function makeBaseEncounter(): EncounterYaml {
  return {
    id: 'test-1',
    name: 'The Database Pooling Crisis',
    sandbox: {
      files: {
        'services/api-gateway/config.yaml': 'pool_size: 10\nmax_connections: 100',
        'services/api-gateway/logs/app.log': 'ERROR: Connection pool exhausted',
      },
      services: {
        'api-gateway': {
          status: 'degraded',
          config: { pool_size: '10', port: '8080' },
          metrics: { active_connections: 95, pool_utilization: 0.95 },
          logs: ['Connection pool exhausted'],
        },
        'cache-layer': {
          status: 'running',
          config: { port: '6379' },
          metrics: { hit_rate: 0.45, memory_usage: 0.8 },
          logs: ['Cache miss rate increasing'],
        },
      },
      incidents: [
        {
          id: 'INC-100',
          title: 'Pool exhaustion under load',
          description: 'api-gateway pool_size was 5, increased to 20 resolved it.',
          resolution: 'Set pool_size to 20 and restart api-gateway',
          tags: ['pool', 'api-gateway'],
        },
      ],
      dependencyGraph: {
        'api-gateway': ['cache-layer'],
        'cache-layer': [],
      },
    },
    prompt: 'The api-gateway is showing degraded performance. Connection pool utilization is at 95%. Investigate and resolve.',
    scoring: [
      {
        condition: "fileContains('services/api-gateway/config.yaml', 'pool_size: 20') && commandMatches('restart api-gateway')",
        score: 1.0,
        resolved: true,
        partial: false,
        details: 'Fixed pool size and restarted api-gateway',
      },
      {
        condition: "fileContains('services/api-gateway/config.yaml', 'pool_size: 20')",
        score: 0.5,
        resolved: false,
        partial: true,
        details: 'Fixed pool size but did not restart',
      },
    ],
    epistemicKeys: {
      search: 'INC-100 pool_size precedent',
    },
  };
}

// ---------------------------------------------------------------------------
// Variance spec
// ---------------------------------------------------------------------------

function makeVarianceSpec(): VarianceSpec {
  return {
    substitutions: [
      { from: 'api-gateway', to: 'request-router' },
      { from: 'pool_size', to: 'thread_count' },
      { from: 'Connection pool exhausted', to: 'Thread pool saturated' },
      { from: 'INC-100', to: 'INC-205' },
      { from: 'Pool exhaustion', to: 'Thread starvation' },
      { from: 'pool', to: 'thread' },
    ],
    idSuffix: 'v1',
    nameSuffix: '(Thread Variant)',
  };
}

// ---------------------------------------------------------------------------
// Tests — RED phase
// ---------------------------------------------------------------------------

describe('encounter family generator', () => {
  describe('generateFamily', () => {
    it('produces the requested number of variants', () => {
      const base = makeBaseEncounter();
      const specs: VarianceSpec[] = [makeVarianceSpec()];
      const family = generateFamily(base, specs);

      expect(family.base.id).toBe('test-1');
      expect(family.variants).toHaveLength(1);
    });

    it('generates multiple variants from multiple specs', () => {
      const base = makeBaseEncounter();
      const specs: VarianceSpec[] = [
        makeVarianceSpec(),
        {
          substitutions: [
            { from: 'api-gateway', to: 'load-balancer' },
            { from: 'pool_size', to: 'worker_count' },
          ],
          idSuffix: 'v2',
          nameSuffix: '(Worker Variant)',
        },
      ];
      const family = generateFamily(base, specs);
      expect(family.variants).toHaveLength(2);
    });

    it('variant IDs include the suffix', () => {
      const family = generateFamily(makeBaseEncounter(), [makeVarianceSpec()]);
      expect(family.variants[0].id).toBe('test-1-v1');
    });

    it('variant names include the suffix', () => {
      const family = generateFamily(makeBaseEncounter(), [makeVarianceSpec()]);
      expect(family.variants[0].name).toContain('(Thread Variant)');
    });

    it('applies substitutions to service names in sandbox', () => {
      const family = generateFamily(makeBaseEncounter(), [makeVarianceSpec()]);
      const variant = family.variants[0];
      const compiled = compileEncounter(variant);
      const sandbox = compiled.setup();

      expect(sandbox.services.has('request-router')).toBe(true);
      expect(sandbox.services.has('api-gateway')).toBe(false);
    });

    it('applies substitutions to file paths', () => {
      const family = generateFamily(makeBaseEncounter(), [makeVarianceSpec()]);
      const variant = family.variants[0];
      const compiled = compileEncounter(variant);
      const sandbox = compiled.setup();

      expect(sandbox.files.has('services/request-router/config.yaml')).toBe(true);
      expect(sandbox.files.has('services/api-gateway/config.yaml')).toBe(false);
    });

    it('applies substitutions to file contents', () => {
      const family = generateFamily(makeBaseEncounter(), [makeVarianceSpec()]);
      const variant = family.variants[0];
      const compiled = compileEncounter(variant);
      const sandbox = compiled.setup();

      const config = sandbox.files.get('services/request-router/config.yaml')!;
      expect(config).toContain('thread_count');
      expect(config).not.toContain('pool_size');
    });

    it('applies substitutions to config keys within services', () => {
      const family = generateFamily(makeBaseEncounter(), [makeVarianceSpec()]);
      const variant = family.variants[0];
      const svc = variant.sandbox.services!['request-router'];
      expect(svc).toBeDefined();
      expect(svc.config['thread_count']).toBe('10');
    });

    it('applies substitutions to incident records', () => {
      const family = generateFamily(makeBaseEncounter(), [makeVarianceSpec()]);
      const variant = family.variants[0];
      expect(variant.sandbox.incidents![0].id).toBe('INC-205');
      expect(variant.sandbox.incidents![0].description).toContain('request-router');
    });

    it('applies substitutions to prompt text', () => {
      const family = generateFamily(makeBaseEncounter(), [makeVarianceSpec()]);
      const variant = family.variants[0];
      const compiled = compileEncounter(variant);
      const prompt = compiled.getPrompt();

      expect(prompt).toContain('request-router');
      expect(prompt).not.toContain('api-gateway');
    });

    it('applies substitutions to scoring conditions', () => {
      const family = generateFamily(makeBaseEncounter(), [makeVarianceSpec()]);
      const variant = family.variants[0];

      expect(variant.scoring[0].condition).toContain('request-router');
      expect(variant.scoring[0].condition).toContain('thread_count');
      expect(variant.scoring[0].condition).not.toContain('api-gateway');
    });

    it('applies substitutions to scoring details', () => {
      const family = generateFamily(makeBaseEncounter(), [makeVarianceSpec()]);
      const variant = family.variants[0];
      expect(variant.scoring[0].details).toContain('request-router');
    });

    it('applies substitutions to dependency graph keys and values', () => {
      const family = generateFamily(makeBaseEncounter(), [makeVarianceSpec()]);
      const variant = family.variants[0];
      expect(variant.sandbox.dependencyGraph!['request-router']).toBeDefined();
      expect(variant.sandbox.dependencyGraph!['api-gateway']).toBeUndefined();
    });

    it('applies substitutions to epistemic keys', () => {
      const family = generateFamily(makeBaseEncounter(), [makeVarianceSpec()]);
      const variant = family.variants[0];
      expect(variant.epistemicKeys!['search']).toContain('INC-205');
    });

    it('preserves scoring logic — variant evaluates identically for equivalent actions', () => {
      const base = makeBaseEncounter();
      const family = generateFamily(base, [makeVarianceSpec()]);

      // Base encounter: fix pool_size, restart api-gateway → score 1.0
      const baseCompiled = compileEncounter(base);
      const baseSandbox = baseCompiled.setup();
      const baseConfig = baseSandbox.files.get('services/api-gateway/config.yaml')!;
      baseSandbox.files.set('services/api-gateway/config.yaml', baseConfig.replace('pool_size: 10', 'pool_size: 20'));
      baseSandbox.commandLog.push('restart api-gateway');
      const baseResult = baseCompiled.evaluate(baseSandbox, []);

      // Variant: fix thread_count, restart request-router → score 1.0
      const variantCompiled = compileEncounter(family.variants[0]);
      const variantSandbox = variantCompiled.setup();
      const variantConfig = variantSandbox.files.get('services/request-router/config.yaml')!;
      variantSandbox.files.set('services/request-router/config.yaml', variantConfig.replace('thread_count: 10', 'thread_count: 20'));
      variantSandbox.commandLog.push('restart request-router');
      const variantResult = variantCompiled.evaluate(variantSandbox, []);

      expect(baseResult.score).toBe(1.0);
      expect(variantResult.score).toBe(1.0);
      expect(baseResult.resolved).toBe(variantResult.resolved);
    });

    it('base encounter is unchanged in the family output', () => {
      const original = makeBaseEncounter();
      const family = generateFamily(makeBaseEncounter(), [makeVarianceSpec()]);
      expect(family.base).toEqual(original);
    });

    it('tracks family membership via familyId', () => {
      const family = generateFamily(makeBaseEncounter(), [makeVarianceSpec()]);
      expect(family.familyId).toBe('test-1');
      expect(family.base.id).toBe('test-1');
      expect(family.variants[0].id).toBe('test-1-v1');
    });

    it('all family members compile to valid EncounterConfigs', () => {
      const family = generateFamily(makeBaseEncounter(), [makeVarianceSpec()]);

      const baseConfig = compileEncounter(family.base);
      expect(baseConfig.setup).toBeDefined();
      expect(baseConfig.evaluate).toBeDefined();

      for (const variant of family.variants) {
        const config = compileEncounter(variant);
        expect(config.setup).toBeDefined();
        expect(config.evaluate).toBeDefined();
        const sandbox = config.setup();
        expect(sandbox.services.size).toBeGreaterThan(0);
      }
    });
  });

  describe('edge cases', () => {
    it('empty substitutions returns variant identical to base except id/name', () => {
      const base = makeBaseEncounter();
      const family = generateFamily(base, [{
        substitutions: [],
        idSuffix: 'v0',
        nameSuffix: '(Clone)',
      }]);
      const variant = family.variants[0];
      expect(variant.id).toBe('test-1-v0');
      // Sandbox content should be identical
      expect(variant.sandbox.services).toEqual(base.sandbox.services);
    });

    it('substitutions are applied in order (earlier subs first)', () => {
      const base = makeBaseEncounter();
      // First sub renames 'api-gateway' → 'gateway', second renames 'gateway' → 'proxy'
      const family = generateFamily(base, [{
        substitutions: [
          { from: 'api-gateway', to: 'gateway' },
          { from: 'gateway', to: 'proxy' },
        ],
        idSuffix: 'v1',
      }]);
      const variant = family.variants[0];
      // 'api-gateway' → 'gateway' → 'proxy'
      expect(variant.sandbox.services!['proxy']).toBeDefined();
    });

    it('array prompts are supported', () => {
      const base = makeBaseEncounter();
      base.prompt = ['Line 1: api-gateway is down', 'Line 2: check pool_size'];
      const family = generateFamily(base, [makeVarianceSpec()]);
      const variant = family.variants[0];
      expect(Array.isArray(variant.prompt)).toBe(true);
      const prompt = variant.prompt as string[];
      expect(prompt[0]).toContain('request-router');
      expect(prompt[1]).toContain('thread_count');
    });
  });
});
