import { describe, it, expect } from 'vitest';
import { parseEncounterYaml, compileEncounter, compileEncounterFromYaml } from '../src/arena/encounter-dsl';
import type { EncounterYaml } from '../src/arena/encounter-dsl';

// ---------------------------------------------------------------------------
// Minimal valid YAML encounter (E1-equivalent)
// ---------------------------------------------------------------------------

const minimalYaml: EncounterYaml = {
  id: 'test-e1',
  name: 'The Test Encounter',
  sandbox: {
    files: {
      'config.yaml': 'key: old_value',
      'logs/app.log': 'INFO: started',
    },
    services: {
      'my-service': {
        status: 'running',
        config: { port: '8080' },
        metrics: { requests: 100 },
        logs: ['started'],
      },
    },
    incidents: [{
      id: 'INC-001',
      title: 'Config was wrong',
      description: 'The old_value should be new_value',
      resolution: 'Fix config and restart',
      tags: ['config'],
    }],
    dependencyGraph: { 'my-service': ['database'] },
  },
  prompt: [
    'Service is returning wrong data.',
    'Fix the config and restart.',
  ],
  scoring: [
    {
      condition: 'fileContains("config.yaml", "new_value") && hasCommand("restart my-service")',
      score: 1.0,
      resolved: true,
      partial: false,
      details: 'Config fixed and service restarted.',
    },
    {
      condition: 'fileContains("config.yaml", "new_value")',
      score: 0.5,
      resolved: false,
      partial: true,
      details: 'Config fixed but not restarted.',
    },
  ],
  epistemicKeys: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseEncounterYaml', () => {
  it('validates a correct encounter definition', () => {
    const result = parseEncounterYaml(minimalYaml);
    expect(result.id).toBe('test-e1');
    expect(result.name).toBe('The Test Encounter');
  });

  it('rejects missing required fields', () => {
    expect(() => parseEncounterYaml({})).toThrow();
  });

  it('rejects invalid service status', () => {
    expect(() => parseEncounterYaml({
      ...minimalYaml,
      sandbox: {
        ...minimalYaml.sandbox,
        services: { bad: { status: 'exploded', config: {}, metrics: {}, logs: [] } },
      },
    })).toThrow();
  });

  it('defaults optional fields', () => {
    const minimal = {
      id: 'e-min',
      name: 'Minimal',
      sandbox: {},
      prompt: 'Fix it.',
      scoring: [],
    };
    const result = parseEncounterYaml(minimal);
    expect(result.sandbox.files).toEqual({});
    expect(result.sandbox.services).toEqual({});
    expect(result.sandbox.incidents).toEqual([]);
    expect(result.sandbox.dependencyGraph).toEqual({});
  });

  it('accepts string prompt', () => {
    const result = parseEncounterYaml({ ...minimalYaml, prompt: 'Fix it.' });
    expect(result.prompt).toBe('Fix it.');
  });

  it('accepts array prompt', () => {
    const result = parseEncounterYaml({ ...minimalYaml, prompt: ['Line 1', 'Line 2'] });
    expect(result.prompt).toEqual(['Line 1', 'Line 2']);
  });
});

describe('compileEncounter', () => {
  it('produces EncounterConfig with correct id and name', () => {
    const config = compileEncounter(minimalYaml);
    expect(config.id).toBe('test-e1');
    expect(config.name).toBe('The Test Encounter');
  });

  it('setup() creates sandbox with files and services', () => {
    const config = compileEncounter(minimalYaml);
    const sandbox = config.setup();
    expect(sandbox.files.get('config.yaml')).toBe('key: old_value');
    expect(sandbox.services.get('my-service')?.status).toBe('running');
    expect(sandbox.incidentDb).toHaveLength(1);
    expect(sandbox.commandLog).toEqual([]);
    expect(sandbox.dependencyGraph['my-service']).toEqual(['database']);
  });

  it('getPrompt() joins array prompt with newlines', () => {
    const config = compileEncounter(minimalYaml);
    expect(config.getPrompt()).toBe('Service is returning wrong data.\nFix the config and restart.');
  });

  it('evaluate() returns full score when all conditions met', () => {
    const config = compileEncounter(minimalYaml);
    const sandbox = config.setup();
    sandbox.files.set('config.yaml', 'key: new_value');
    sandbox.commandLog.push('restart my-service');
    const result = config.evaluate(sandbox, []);
    expect(result.resolved).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.details).toContain('Config fixed and service restarted');
  });

  it('evaluate() returns partial score for partial fix', () => {
    const config = compileEncounter(minimalYaml);
    const sandbox = config.setup();
    sandbox.files.set('config.yaml', 'key: new_value');
    const result = config.evaluate(sandbox, []);
    expect(result.resolved).toBe(false);
    expect(result.partial).toBe(true);
    expect(result.score).toBe(0.5);
  });

  it('evaluate() returns 0 when nothing fixed', () => {
    const config = compileEncounter(minimalYaml);
    const sandbox = config.setup();
    const result = config.evaluate(sandbox, []);
    expect(result.score).toBe(0);
    expect(result.details).toContain('No scoring condition matched');
  });
});

describe('condition evaluator', () => {
  it('fileContains works', () => {
    const config = compileEncounter({
      ...minimalYaml,
      scoring: [{
        condition: 'fileContains("config.yaml", "old_value")',
        score: 1.0, resolved: true, partial: false, details: 'found',
      }],
    });
    const sandbox = config.setup();
    expect(config.evaluate(sandbox, []).score).toBe(1.0);
  });

  it('fileNotContains works', () => {
    const config = compileEncounter({
      ...minimalYaml,
      scoring: [{
        condition: 'fileNotContains("config.yaml", "missing")',
        score: 1.0, resolved: true, partial: false, details: 'not found',
      }],
    });
    const sandbox = config.setup();
    expect(config.evaluate(sandbox, []).score).toBe(1.0);
  });

  it('commandMatchesAll works', () => {
    const config = compileEncounter({
      ...minimalYaml,
      scoring: [{
        condition: 'commandMatchesAll("restart", "validate")',
        score: 1.0, resolved: true, partial: false, details: 'both',
      }],
    });
    const sandbox = config.setup();
    sandbox.commandLog.push('restart my-service', 'validate config');
    expect(config.evaluate(sandbox, []).score).toBe(1.0);
  });

  it('serviceStatus works', () => {
    const config = compileEncounter({
      ...minimalYaml,
      scoring: [{
        condition: 'serviceStatus("my-service") === "running"',
        score: 1.0, resolved: true, partial: false, details: 'running',
      }],
    });
    const sandbox = config.setup();
    expect(config.evaluate(sandbox, []).score).toBe(1.0);
  });

  it('handles invalid expressions gracefully', () => {
    const config = compileEncounter({
      ...minimalYaml,
      scoring: [{
        condition: 'this is not valid javascript!!!',
        score: 1.0, resolved: true, partial: false, details: 'should not match',
      }],
    });
    const sandbox = config.setup();
    expect(config.evaluate(sandbox, []).score).toBe(0);
  });
});

describe('compileEncounterFromYaml', () => {
  it('parses and compiles in one step', () => {
    const config = compileEncounterFromYaml(minimalYaml);
    expect(config.id).toBe('test-e1');
    const sandbox = config.setup();
    expect(sandbox.files.has('config.yaml')).toBe(true);
  });
});
