import { describe, it, expect } from 'vitest';
import {
  computeSystemHealth,
  type CouplingPoint,
  type ConfigCoherenceCheck,
} from '../../src/arena/cascade-scoring';
import type { Sandbox } from '../../src/arena/types';

function makeSandbox(overrides?: Partial<Sandbox>): Sandbox {
  return {
    files: new Map(),
    services: new Map([
      ['svc-a', {
        status: 'running',
        config: { port: '8080' },
        metrics: {},
        logs: [],
      }],
      ['svc-b', {
        status: 'running',
        config: { port: '8081' },
        metrics: {},
        logs: [],
      }],
    ]),
    incidentDb: [],
    dependencyGraph: {},
    commandLog: [],
    ...overrides,
  };
}

describe('computeSystemHealth', () => {
  it('returns healthy vector when no damage occurred', () => {
    const sandbox = makeSandbox();
    const preStatuses = new Map([['svc-a', 'running'], ['svc-b', 'running']]);

    const health = computeSystemHealth(sandbox, preStatuses);

    expect(health.primaryFixed).toBe(false);
    expect(health.noCascadeDamage).toBe(true);
    expect(health.configCoherent).toBe(true);
    expect(health.dataIntegrity).toBe(true);
    expect(health.healthScore).toBeGreaterThan(0);
  });

  it('detects cascade damage when a running service becomes degraded', () => {
    const sandbox = makeSandbox({
      services: new Map([
        ['svc-a', { status: 'running', config: {}, metrics: {}, logs: [] }],
        ['svc-b', { status: 'degraded', config: {}, metrics: {}, logs: [] }],
      ]),
    });
    const preStatuses = new Map([['svc-a', 'running'], ['svc-b', 'running']]);

    const health = computeSystemHealth(sandbox, preStatuses);

    expect(health.noCascadeDamage).toBe(false);
  });

  it('detects cascade damage when a running service becomes stopped', () => {
    const sandbox = makeSandbox({
      services: new Map([
        ['svc-a', { status: 'running', config: {}, metrics: {}, logs: [] }],
        ['svc-b', { status: 'stopped', config: {}, metrics: {}, logs: [] }],
      ]),
    });
    const preStatuses = new Map([['svc-a', 'running'], ['svc-b', 'running']]);

    const health = computeSystemHealth(sandbox, preStatuses);

    expect(health.noCascadeDamage).toBe(false);
  });

  it('does not flag cascade damage if service was already degraded before', () => {
    const sandbox = makeSandbox({
      services: new Map([
        ['svc-a', { status: 'running', config: {}, metrics: {}, logs: [] }],
        ['svc-b', { status: 'degraded', config: {}, metrics: {}, logs: [] }],
      ]),
    });
    const preStatuses = new Map([['svc-a', 'running'], ['svc-b', 'degraded']]);

    const health = computeSystemHealth(sandbox, preStatuses);

    expect(health.noCascadeDamage).toBe(true);
  });

  it('evaluates coupling points and detects damage', () => {
    const sandbox = makeSandbox();
    const preStatuses = new Map([['svc-a', 'running'], ['svc-b', 'running']]);

    const couplingPoints: CouplingPoint[] = [{
      service: 'svc-b',
      condition: () => true,
      description: 'svc-b breaks when condition is met',
    }];

    const health = computeSystemHealth(sandbox, preStatuses, { couplingPoints });

    expect(health.noCascadeDamage).toBe(false);
  });

  it('coupling point that returns false does not trigger damage', () => {
    const sandbox = makeSandbox();
    const preStatuses = new Map([['svc-a', 'running'], ['svc-b', 'running']]);

    const couplingPoints: CouplingPoint[] = [{
      service: 'svc-b',
      condition: () => false,
      description: 'svc-b is fine',
    }];

    const health = computeSystemHealth(sandbox, preStatuses, { couplingPoints });

    expect(health.noCascadeDamage).toBe(true);
  });

  it('detects config incoherence across services', () => {
    const sandbox = makeSandbox({
      services: new Map([
        ['svc-a', { status: 'running', config: { db_version: '14' }, metrics: {}, logs: [] }],
        ['svc-b', { status: 'running', config: { db_version: '15' }, metrics: {}, logs: [] }],
      ]),
    });
    const preStatuses = new Map([['svc-a', 'running'], ['svc-b', 'running']]);

    const checks: ConfigCoherenceCheck[] = [{
      services: ['svc-a', 'svc-b'],
      key: 'db_version',
      validator: (values) => new Set(values).size === 1,
    }];

    const health = computeSystemHealth(sandbox, preStatuses, {
      requiredConfigKeys: checks,
    });

    expect(health.configCoherent).toBe(false);
  });

  it('config coherence passes when validator returns true', () => {
    const sandbox = makeSandbox({
      services: new Map([
        ['svc-a', { status: 'running', config: { db_version: '14' }, metrics: {}, logs: [] }],
        ['svc-b', { status: 'running', config: { db_version: '14' }, metrics: {}, logs: [] }],
      ]),
    });
    const preStatuses = new Map([['svc-a', 'running'], ['svc-b', 'running']]);

    const checks: ConfigCoherenceCheck[] = [{
      services: ['svc-a', 'svc-b'],
      key: 'db_version',
      validator: (values) => new Set(values).size === 1,
    }];

    const health = computeSystemHealth(sandbox, preStatuses, {
      requiredConfigKeys: checks,
    });

    expect(health.configCoherent).toBe(true);
  });

  it('detects data integrity risk from dangerous command patterns', () => {
    const sandbox = makeSandbox({
      commandLog: ['drop-table users'],
    });
    const preStatuses = new Map([['svc-a', 'running'], ['svc-b', 'running']]);

    const health = computeSystemHealth(sandbox, preStatuses);

    expect(health.dataIntegrity).toBe(false);
  });

  it('data integrity passes when drop follows backup', () => {
    const sandbox = makeSandbox({
      commandLog: ['backup database', 'drop-table users'],
    });
    const preStatuses = new Map([['svc-a', 'running'], ['svc-b', 'running']]);

    const health = computeSystemHealth(sandbox, preStatuses);

    expect(health.dataIntegrity).toBe(true);
  });

  it('detects data integrity risk from truncate on production', () => {
    const sandbox = makeSandbox({
      commandLog: ['truncate orders-primary'],
    });
    const preStatuses = new Map([['svc-a', 'running'], ['svc-b', 'running']]);

    const health = computeSystemHealth(sandbox, preStatuses);

    expect(health.dataIntegrity).toBe(false);
  });

  it('computes correct weighted health score', () => {
    const sandbox = makeSandbox();
    const preStatuses = new Map([['svc-a', 'running'], ['svc-b', 'running']]);

    const health = computeSystemHealth(sandbox, preStatuses);

    // primaryFixed=false(0), noCascade=true(0.25), config=true(0.2), data=true(0.15)
    // score = 0*0.4 + 1*0.25 + 1*0.2 + 1*0.15 = 0.6
    expect(health.healthScore).toBeCloseTo(0.6);
  });

  it('health score is 1.0 when everything passes including primaryFixed', () => {
    const sandbox = makeSandbox();
    const preStatuses = new Map([['svc-a', 'running'], ['svc-b', 'running']]);

    const health = computeSystemHealth(sandbox, preStatuses, {}, true);

    expect(health.primaryFixed).toBe(true);
    expect(health.healthScore).toBeCloseTo(1.0);
  });

  it('health score reflects multiple failures', () => {
    const sandbox = makeSandbox({
      services: new Map([
        ['svc-a', { status: 'running', config: {}, metrics: {}, logs: [] }],
        ['svc-b', { status: 'degraded', config: {}, metrics: {}, logs: [] }],
      ]),
      commandLog: ['drop-table users'],
    });
    const preStatuses = new Map([['svc-a', 'running'], ['svc-b', 'running']]);

    const health = computeSystemHealth(sandbox, preStatuses);

    // primaryFixed=false, noCascade=false, config=true, data=false
    // score = 0 + 0 + 0.2 + 0 = 0.2
    expect(health.healthScore).toBeCloseTo(0.2);
  });
});
