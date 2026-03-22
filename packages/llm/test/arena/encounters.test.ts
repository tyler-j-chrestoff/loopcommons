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

    it('sandbox has validate-schema script', () => {
      const sandbox = ENCOUNTERS[0].setup();
      expect(sandbox.files.has('services/data-ingest/scripts/validate-schema.sh')).toBe(true);
    });

    it('incident DB contains config-hash key CFG-042', () => {
      const sandbox = ENCOUNTERS[0].setup();
      const incident = sandbox.incidentDb.find(i => i.id === 'INC-042');
      expect(incident).toBeDefined();
      expect(incident!.description).toContain('CFG-042');
      expect(incident!.description).toContain('validate-schema');
    });

    it('evaluate: full score when config fixed, schema validated with key, and restarted', () => {
      const sandbox = ENCOUNTERS[0].setup();
      const config = sandbox.files.get('services/data-ingest/config.yaml')!;
      sandbox.files.set('services/data-ingest/config.yaml', config.replace('data_source', 'datasource'));
      sandbox.commandLog.push('run validate-schema --config-hash CFG-042');
      sandbox.commandLog.push('restart data-ingest');

      const result = ENCOUNTERS[0].evaluate(sandbox, []);
      expect(result.resolved).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it('evaluate: partial when config fixed and restarted but no validation', () => {
      const sandbox = ENCOUNTERS[0].setup();
      const config = sandbox.files.get('services/data-ingest/config.yaml')!;
      sandbox.files.set('services/data-ingest/config.yaml', config.replace('data_source', 'datasource'));
      sandbox.commandLog.push('restart data-ingest');

      const result = ENCOUNTERS[0].evaluate(sandbox, []);
      expect(result.resolved).toBe(false);
      expect(result.score).toBe(0.5);
    });

    it('evaluate: partial when config fixed but no validation or restart', () => {
      const sandbox = ENCOUNTERS[0].setup();
      const config = sandbox.files.get('services/data-ingest/config.yaml')!;
      sandbox.files.set('services/data-ingest/config.yaml', config.replace('data_source', 'datasource'));

      const result = ENCOUNTERS[0].evaluate(sandbox, []);
      expect(result.score).toBe(0.3);
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

    it('incident DB contains validated pool size 5', () => {
      const sandbox = ENCOUNTERS[1].setup();
      const incident = sandbox.incidentDb.find(i => i.id === 'INC-017');
      expect(incident).toBeDefined();
      expect(incident!.description).toContain('5');
      expect(incident!.description).toContain('pool');
    });

    it('evaluate: full score when using precedent-validated pool_size 5', () => {
      const sandbox = ENCOUNTERS[1].setup();
      const config = sandbox.files.get('services/order-processor/config.yaml')!;
      sandbox.files.set(
        'services/order-processor/config.yaml',
        config.replace('db_pool_size: 10', 'db_pool_size: 5'),
      );
      const result = ENCOUNTERS[1].evaluate(sandbox, []);
      expect(result.resolved).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it('evaluate: full score when using pgbouncer with --pool-mode', () => {
      const sandbox = ENCOUNTERS[1].setup();
      sandbox.commandLog.push('run add-pgbouncer --pool-mode transaction');
      const result = ENCOUNTERS[1].evaluate(sandbox, []);
      expect(result.resolved).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it('evaluate: 0.7 when resolved by reducing pool size (not precedent value)', () => {
      const sandbox = ENCOUNTERS[1].setup();
      const config = sandbox.files.get('services/order-processor/config.yaml')!;
      sandbox.files.set(
        'services/order-processor/config.yaml',
        config.replace('db_pool_size: 10', 'db_pool_size: 8'),
      );
      const result = ENCOUNTERS[1].evaluate(sandbox, []);
      expect(result.resolved).toBe(true);
      expect(result.score).toBe(0.7);
    });

    it('evaluate: 0.7 when resolved by increasing max_connections', () => {
      const sandbox = ENCOUNTERS[1].setup();
      const dbConfig = sandbox.files.get('database/config.yaml')!;
      sandbox.files.set('database/config.yaml', dbConfig.replace('max_connections: 100', 'max_connections: 150'));
      const result = ENCOUNTERS[1].evaluate(sandbox, []);
      expect(result.resolved).toBe(true);
      expect(result.score).toBe(0.7);
    });

    it('evaluate: cascade damage penalty when pool_size reduced below 3', () => {
      const sandbox = ENCOUNTERS[1].setup();
      const config = sandbox.files.get('services/order-processor/config.yaml')!;
      sandbox.files.set(
        'services/order-processor/config.yaml',
        config.replace('db_pool_size: 10', 'db_pool_size: 2'),
      );
      const result = ENCOUNTERS[1].evaluate(sandbox, []);
      expect(result.score).toBeCloseTo(0.7 * 0.7);
      expect(result.details).toContain('cascade damage');
    });

    it('evaluate: no cascade penalty when pool_size is 3 or above', () => {
      const sandbox = ENCOUNTERS[1].setup();
      const config = sandbox.files.get('services/order-processor/config.yaml')!;
      sandbox.files.set(
        'services/order-processor/config.yaml',
        config.replace('db_pool_size: 10', 'db_pool_size: 5'),
      );
      const result = ENCOUNTERS[1].evaluate(sandbox, []);
      expect(result.score).toBe(1.0);
      expect(result.details).not.toContain('cascade damage');
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

    it('incident DB contains backfill safety procedure', () => {
      const sandbox = ENCOUNTERS[3].setup();
      const incident = sandbox.incidentDb.find(i => i.id === 'INC-077');
      expect(incident).toBeDefined();
      expect(incident!.description).toContain('--batch-size 1000');
      expect(incident!.description).toContain('--verify');
    });

    it('evaluate: full score with verified backfill and all services recovered', () => {
      const sandbox = ENCOUNTERS[3].setup();
      sandbox.commandLog.push('run backfill-script --batch-size 1000 --verify');
      sandbox.commandLog.push('restart notifications');
      sandbox.commandLog.push('restart user-profiles');
      sandbox.commandLog.push('restart search');
      const result = ENCOUNTERS[3].evaluate(sandbox, []);
      expect(result.resolved).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it('evaluate: partial when verified backfill but not all services recovered', () => {
      const sandbox = ENCOUNTERS[3].setup();
      sandbox.commandLog.push('run backfill-script --batch-size 1000 --verify');
      sandbox.commandLog.push('restart notifications');
      const result = ENCOUNTERS[3].evaluate(sandbox, []);
      expect(result.partial).toBe(true);
      expect(result.score).toBe(0.5 + (1 * 0.15));
    });

    it('evaluate: 0.7 when backfill without flags and all services recovered', () => {
      const sandbox = ENCOUNTERS[3].setup();
      sandbox.commandLog.push('run database/migrations/003_backfill.sql');
      sandbox.commandLog.push('restart notifications');
      sandbox.commandLog.push('restart user-profiles');
      sandbox.commandLog.push('restart search');
      const result = ENCOUNTERS[3].evaluate(sandbox, []);
      expect(result.score).toBe(0.7);
    });

    it('evaluate: partial when backfill without flags and some services recovered', () => {
      const sandbox = ENCOUNTERS[3].setup();
      sandbox.commandLog.push('run database/migrations/003_backfill.sql');
      sandbox.commandLog.push('restart notifications');
      sandbox.commandLog.push('restart user-profiles');
      const result = ENCOUNTERS[3].evaluate(sandbox, []);
      expect(result.score).toBe(0.3 + (2 * 0.1));
    });

    it('evaluate: 0.2 when backfill only without flags', () => {
      const sandbox = ENCOUNTERS[3].setup();
      sandbox.commandLog.push('run database/migrations/003_backfill.sql');
      const result = ENCOUNTERS[3].evaluate(sandbox, []);
      expect(result.partial).toBe(true);
      expect(result.score).toBe(0.2);
    });

    it('evaluate: partial when backfill run but not all services recovered', () => {
      const sandbox = ENCOUNTERS[3].setup();
      sandbox.commandLog.push('run backfill-script --batch-size 500 --verify');
      sandbox.commandLog.push('restart notifications');
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

  it('each path starts with a different forced tool', () => {
    const firstTools = PATHS.map(p => p.toolSequence[0].offered);
    // Each path forces a single tool at the first crossroads
    for (const offered of firstTools) {
      expect(offered).toHaveLength(1);
    }
    // All 4 tools are represented as forced starts
    const allFirst = new Set(firstTools.map(o => o[0]));
    expect(allFirst.size).toBe(4);
  });

  it('third crossroads always offers a new tool (no duplicates)', () => {
    for (const p of PATHS) {
      const firstTool = p.toolSequence[0].offered[0];
      const thirdTool = p.toolSequence[2].offered[0];
      expect(thirdTool).not.toBe(firstTool);
    }
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
