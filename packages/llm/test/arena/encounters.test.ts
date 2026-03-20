import { describe, it, expect } from 'vitest';
import { ENCOUNTERS, PATHS, BASELINE_PATH, classifyE4Approach } from '../../src/arena/encounters';
import type { StepRecord } from '../../src/arena/types';

describe('ENCOUNTERS', () => {
  it('defines exactly 4 encounters in order', () => {
    expect(ENCOUNTERS).toHaveLength(4);
    expect(ENCOUNTERS.map(e => e.id)).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  it('all encounters have names, setup, prompt, and evaluate', () => {
    for (const enc of ENCOUNTERS) {
      expect(enc.name).toBeTruthy();
      const sandbox = enc.setup();
      expect(sandbox.files).toBeInstanceOf(Map);
      expect(enc.getPrompt()).toBeTruthy();
      expect(typeof enc.evaluate).toBe('function');
    }
  });

  describe('E1: The Silent Deployment', () => {
    it('sandbox contains the misconfigured field', () => {
      const sandbox = ENCOUNTERS[0].setup();
      const config = sandbox.files.get('services/data-ingest/config.yaml')!;
      expect(config).toContain('data_source');
      const schema = sandbox.files.get('services/data-ingest/config.schema.json')!;
      expect(schema).toContain('datasource');
    });

    it('evaluate: resolved when config fixed and service restarted', () => {
      const sandbox = ENCOUNTERS[0].setup();
      // Fix the config
      const config = sandbox.files.get('services/data-ingest/config.yaml')!;
      sandbox.files.set('services/data-ingest/config.yaml', config.replace('data_source', 'datasource'));
      // Restart
      sandbox.commandLog.push('restart data-ingest');

      const result = ENCOUNTERS[0].evaluate(sandbox, []);
      expect(result.resolved).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it('evaluate: partial when root cause found but not fixed', () => {
      const sandbox = ENCOUNTERS[0].setup();
      // Don't fix anything
      const result = ENCOUNTERS[0].evaluate(sandbox, []);
      expect(result.resolved).toBe(false);
    });
  });

  describe('E2: The Resource Contention', () => {
    it('sandbox has 3 services sharing a database', () => {
      const sandbox = ENCOUNTERS[1].setup();
      expect(sandbox.services.has('order-processor')).toBe(true);
      expect(sandbox.services.has('inventory-service')).toBe(true);
      expect(sandbox.services.has('payment-service')).toBe(true);
    });

    it('evaluate: resolved when inventory-service timeouts eliminated', () => {
      const sandbox = ENCOUNTERS[1].setup();
      // Fix: reduce order-processor pool size
      const config = sandbox.files.get('services/order-processor/config.yaml')!;
      sandbox.files.set(
        'services/order-processor/config.yaml',
        config.replace('db_pool_size: 10', 'db_pool_size: 8'),
      );
      const result = ENCOUNTERS[1].evaluate(sandbox, []);
      expect(result.resolved).toBe(true);
    });

    it('evaluate: also resolved by increasing max_connections', () => {
      const sandbox = ENCOUNTERS[1].setup();
      const dbConfig = sandbox.files.get('database/config.yaml')!;
      sandbox.files.set('database/config.yaml', dbConfig.replace('max_connections: 100', 'max_connections: 150'));
      const result = ENCOUNTERS[1].evaluate(sandbox, []);
      expect(result.resolved).toBe(true);
    });
  });

  describe('E3: The Code Review', () => {
    it('prompt includes prior encounter output when provided', () => {
      const prompt = ENCOUNTERS[2].getPrompt([
        { encounterId: 'e2', response: 'Reduced pool size to 8', resolved: true },
      ]);
      expect(prompt).toContain('Reduced pool size');
    });

    it('prompt includes feedback items', () => {
      const prompt = ENCOUNTERS[2].getPrompt([
        { encounterId: 'e2', response: 'Fixed it', resolved: true },
      ]);
      expect(prompt).toContain('feedback');
    });
  });

  describe('E4: The Cascading Failure', () => {
    it('sandbox has 5 services and an unrun backfill script', () => {
      const sandbox = ENCOUNTERS[3].setup();
      expect(sandbox.services.has('auth-service')).toBe(true);
      expect(sandbox.services.has('billing')).toBe(true);
      expect(sandbox.services.has('notifications')).toBe(true);
      expect(sandbox.services.has('user-profiles')).toBe(true);
      expect(sandbox.services.has('search')).toBe(true);
      expect(sandbox.files.has('database/migrations/003_backfill.sql')).toBe(true);
    });

    it('evaluate: resolved when backfill run and downstream services recovered', () => {
      const sandbox = ENCOUNTERS[3].setup();
      sandbox.commandLog.push('run database/migrations/003_backfill.sql');
      sandbox.commandLog.push('restart notifications');
      sandbox.commandLog.push('restart user-profiles');
      sandbox.commandLog.push('restart search');
      const result = ENCOUNTERS[3].evaluate(sandbox, []);
      expect(result.resolved).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it('evaluate: partial when backfill run but not all services recovered', () => {
      const sandbox = ENCOUNTERS[3].setup();
      sandbox.commandLog.push('run database/migrations/003_backfill.sql');
      const result = ENCOUNTERS[3].evaluate(sandbox, []);
      expect(result.partial).toBe(true);
    });
  });
});

describe('PATHS', () => {
  it('defines exactly 4 convergent paths', () => {
    expect(PATHS).toHaveLength(4);
  });

  it('all paths end with agent holding {inspect, act}', () => {
    // Path 1: inspect → search → act(drop search) → {inspect, act}
    // Path 2: act → search → inspect(drop search) → {inspect, act}
    // Path 3: inspect → model → act(drop model) → {inspect, act}
    // Path 4: act → model → inspect(drop model) → {inspect, act}
    for (const path of PATHS) {
      const seq = path.toolSequence;
      expect(seq).toHaveLength(3);
      // Third choice always requires a drop
      expect(seq[2].mustDrop).toBe(true);
    }
  });

  it('paths 1&3 start with inspect, 2&4 start with act', () => {
    expect(PATHS[0].toolSequence[0].offered).toContain('inspect');
    expect(PATHS[1].toolSequence[0].offered).toContain('act');
    expect(PATHS[2].toolSequence[0].offered).toContain('inspect');
    expect(PATHS[3].toolSequence[0].offered).toContain('act');
  });

  it('paths 1&2 use search as intermediate, 3&4 use model', () => {
    expect(PATHS[0].toolSequence[1].offered).toContain('search');
    expect(PATHS[1].toolSequence[1].offered).toContain('search');
    expect(PATHS[2].toolSequence[1].offered).toContain('model');
    expect(PATHS[3].toolSequence[1].offered).toContain('model');
  });
});

describe('BASELINE_PATH', () => {
  it('has no tool sequence (static composition)', () => {
    expect(BASELINE_PATH.toolSequence).toHaveLength(0);
  });

  it('is labeled as baseline', () => {
    expect(BASELINE_PATH.id).toBe('baseline');
  });
});

describe('classifyE4Approach', () => {
  function makeSteps(toolNames: string[]): StepRecord[] {
    return toolNames.map((name, i) => ({
      encounterId: 'e4',
      stepIndex: i,
      toolName: name,
      toolInput: {},
      toolOutput: '',
      durationMs: 100,
    }));
  }

  it('classifies observe-first: ≥7/10 inspect', () => {
    const steps = makeSteps([
      'inspect', 'inspect', 'inspect', 'inspect', 'inspect',
      'inspect', 'inspect', 'act', 'act', 'act',
    ]);
    expect(classifyE4Approach(steps)).toBe('observe-first');
  });

  it('classifies act-first: ≥7/10 act', () => {
    const steps = makeSteps([
      'act', 'act', 'act', 'act', 'act',
      'act', 'act', 'inspect', 'inspect', 'inspect',
    ]);
    expect(classifyE4Approach(steps)).toBe('act-first');
  });

  it('classifies systematic: alternating inspect→act on same service', () => {
    // Systematic = inspect then act in pairs
    const steps = makeSteps([
      'inspect', 'act', 'inspect', 'act', 'inspect',
      'act', 'inspect', 'act', 'inspect', 'act',
    ]);
    expect(classifyE4Approach(steps)).toBe('systematic');
  });

  it('classifies breadth-first: first 5+ inspect different services', () => {
    const steps: StepRecord[] = [
      { encounterId: 'e4', stepIndex: 0, toolName: 'inspect', toolInput: { target: 'service:auth' }, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 1, toolName: 'inspect', toolInput: { target: 'service:billing' }, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 2, toolName: 'inspect', toolInput: { target: 'service:notifications' }, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 3, toolName: 'inspect', toolInput: { target: 'service:user-profiles' }, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 4, toolName: 'inspect', toolInput: { target: 'service:search' }, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 5, toolName: 'act', toolInput: {}, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 6, toolName: 'act', toolInput: {}, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 7, toolName: 'act', toolInput: {}, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 8, toolName: 'inspect', toolInput: {}, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 9, toolName: 'act', toolInput: {}, toolOutput: '', durationMs: 100 },
    ];
    expect(classifyE4Approach(steps)).toBe('breadth-first');
  });

  it('classifies targeted: few inspects concentrated on one area, then precise act', () => {
    const steps: StepRecord[] = [
      { encounterId: 'e4', stepIndex: 0, toolName: 'inspect', toolInput: { target: 'service:auth-service' }, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 1, toolName: 'inspect', toolInput: { target: 'services/auth-service/config.yaml' }, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 2, toolName: 'inspect', toolInput: { target: 'database/migrations/003_backfill.sql' }, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 3, toolName: 'act', toolInput: { command: 'run database/migrations/003_backfill.sql' }, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 4, toolName: 'act', toolInput: {}, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 5, toolName: 'act', toolInput: {}, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 6, toolName: 'act', toolInput: {}, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 7, toolName: 'act', toolInput: {}, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 8, toolName: 'act', toolInput: {}, toolOutput: '', durationMs: 100 },
      { encounterId: 'e4', stepIndex: 9, toolName: 'act', toolInput: {}, toolOutput: '', durationMs: 100 },
    ];
    expect(classifyE4Approach(steps)).toBe('targeted');
  });

  it('returns null for fewer than 10 steps', () => {
    const steps = makeSteps(['inspect', 'act']);
    expect(classifyE4Approach(steps)).toBeNull();
  });
});
