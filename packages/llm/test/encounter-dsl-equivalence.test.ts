/**
 * Equivalence test — verifies YAML-compiled E1 produces identical
 * evaluation results to the hand-coded E1 encounter.
 */

import { describe, it, expect } from 'vitest';
import { compileEncounterFromYaml } from '../src/arena/encounter-dsl';
import { ENCOUNTERS } from '../src/arena/encounters';

const e1Original = ENCOUNTERS[0];

// E1 ported to YAML format
const e1Yaml = {
  id: 'e1',
  name: 'The Silent Deployment',
  sandbox: {
    files: {
      'services/data-ingest/config.yaml': [
        'service: data-ingest',
        'port: 8080',
        'data_source: postgres://localhost:5432/ingest_db',
        'fallback_source: memory',
        'log_level: info',
      ].join('\n'),
      'services/data-ingest/config.schema.json': JSON.stringify({
        required: ['service', 'port', 'datasource'],
        properties: {
          service: { type: 'string' },
          port: { type: 'number' },
          datasource: { type: 'string', description: 'Primary data source connection string' },
          fallback_source: { type: 'string' },
        },
      }, null, 2),
      'services/data-ingest/scripts/validate-schema.sh': [
        '#!/bin/bash',
        '# Validates config schema and clears stale schema cache',
        'set -euo pipefail',
        'CONFIG_HASH="${1:?Usage: validate-schema.sh <config-hash>}"',
        'echo "Validating schema for config hash: $CONFIG_HASH"',
        'echo "Clearing stale schema cache..."',
        'echo "Schema validation complete."',
      ].join('\n'),
      'services/data-ingest/logs/app.log': [
        '2026-03-20T08:00:00Z INFO: Starting data-ingest v2.4.0',
        '2026-03-20T08:00:01Z INFO: Config loaded from /etc/data-ingest/config.yaml',
        '2026-03-20T08:00:01Z INFO: Using fallback data source: memory',
        '2026-03-20T08:00:02Z INFO: Health check endpoint ready on :8080/health',
        '2026-03-20T08:00:03Z INFO: Accepting connections',
      ].join('\n'),
      'services/data-ingest/health': JSON.stringify({ status: 'healthy', uptime: '4h', version: '2.4.0' }),
      'services/data-api/logs/app.log': [
        '2026-03-20T08:05:00Z INFO: Received query for user_events',
        '2026-03-20T08:05:00Z WARN: Query returned 0 results',
        '2026-03-20T08:10:00Z INFO: Received query for user_events',
        '2026-03-20T08:10:00Z WARN: Query returned 0 results',
        '2026-03-20T08:15:00Z INFO: Received query for transactions',
        '2026-03-20T08:15:00Z WARN: Query returned 0 results',
      ].join('\n'),
      'services/data-api/metrics.json': JSON.stringify({ requests: 1200, empty_responses: 1200, error_responses: 0, avg_latency_ms: 2 }),
      'deploy/changelog.md': [
        '## 2026-03-20 — data-ingest v2.4.0',
        '- Migrated config schema: renamed fields for consistency',
        '- data_source → datasource',
        '- Added fallback_source option',
      ].join('\n'),
    },
    services: {
      'data-ingest': {
        status: 'running' as const,
        config: { port: '8080', version: '2.4.0' },
        metrics: { requests: 0, uptime_hours: 4 },
        logs: ['Using fallback data source: memory'],
      },
      'data-api': {
        status: 'running' as const,
        config: { port: '8081', upstream: 'data-ingest' },
        metrics: { requests: 1200, empty_responses: 1200, errors: 0 },
        logs: ['Query returned 0 results'],
      },
    },
    incidents: [{
      id: 'INC-042',
      title: 'Config migration broke field mapping',
      description: 'Service v2.0 renamed data_source to datasource but deployed config was not updated. Silent fallback to in-memory store. After fixing config, must run validate-schema --config-hash CFG-042 to clear stale schema cache before restart, otherwise fallback persists.',
      resolution: 'Updated config field name, ran validate-schema --config-hash CFG-042, and restarted service.',
      tags: ['config', 'migration', 'silent-failure'],
    }],
    dependencyGraph: {
      'data-api': ['data-ingest'],
      'data-ingest': ['database'],
    },
  },
  prompt: [
    'INCIDENT: Service data-ingest was redeployed to v2.4.0 four hours ago.',
    'Health checks pass (200 OK). No error logs. But downstream service data-api reports',
    'every query returning 0 results. Users see no errors — just missing data.',
    '',
    'Your goal: diagnose the root cause and fix it so data-api returns real data again.',
    'You have access to the service configs, logs, metrics, and deployment changelog.',
  ],
  scoring: [
    {
      condition: 'fileContains("services/data-ingest/config.yaml", "datasource:") && fileNotContains("services/data-ingest/config.yaml", "data_source:") && hasCommand("validate-schema") && hasCommand("CFG-042") && hasCommand("restart") && hasCommand("data-ingest")',
      score: 1.0,
      resolved: true,
      partial: false,
      details: 'Config field fixed, schema validated with key, and service restarted.',
    },
    {
      condition: 'fileContains("services/data-ingest/config.yaml", "datasource:") && fileNotContains("services/data-ingest/config.yaml", "data_source:") && hasCommand("restart") && hasCommand("data-ingest")',
      score: 0.5,
      resolved: false,
      partial: true,
      details: 'Config fixed and restarted but schema cache not validated.',
    },
    {
      condition: 'fileContains("services/data-ingest/config.yaml", "datasource:") && fileNotContains("services/data-ingest/config.yaml", "data_source:")',
      score: 0.3,
      resolved: false,
      partial: true,
      details: 'Config fixed but no validation or restart.',
    },
  ],
};

describe('E1 YAML equivalence', () => {
  const e1Compiled = compileEncounterFromYaml(e1Yaml);

  it('same id and name', () => {
    expect(e1Compiled.id).toBe(e1Original.id);
    expect(e1Compiled.name).toBe(e1Original.name);
  });

  it('same prompt', () => {
    expect(e1Compiled.getPrompt()).toBe(e1Original.getPrompt());
  });

  it('same sandbox files', () => {
    const origSandbox = e1Original.setup();
    const yamlSandbox = e1Compiled.setup();
    expect([...yamlSandbox.files.keys()].sort()).toEqual([...origSandbox.files.keys()].sort());
    for (const [key, value] of origSandbox.files) {
      expect(yamlSandbox.files.get(key)).toBe(value);
    }
  });

  it('same sandbox services', () => {
    const origSandbox = e1Original.setup();
    const yamlSandbox = e1Compiled.setup();
    expect([...yamlSandbox.services.keys()].sort()).toEqual([...origSandbox.services.keys()].sort());
  });

  // Evaluation equivalence: test all 4 scoring tiers
  it('score 1.0 — config fixed + validated + restarted', () => {
    const origSandbox = e1Original.setup();
    const yamlSandbox = e1Compiled.setup();

    // Apply the fix
    const fixedConfig = 'service: data-ingest\nport: 8080\ndatasource: postgres://localhost:5432/ingest_db\nfallback_source: memory\nlog_level: info';
    origSandbox.files.set('services/data-ingest/config.yaml', fixedConfig);
    yamlSandbox.files.set('services/data-ingest/config.yaml', fixedConfig);
    origSandbox.commandLog.push('validate-schema --config-hash CFG-042', 'restart data-ingest');
    yamlSandbox.commandLog.push('validate-schema --config-hash CFG-042', 'restart data-ingest');

    const origResult = e1Original.evaluate(origSandbox, []);
    const yamlResult = e1Compiled.evaluate(yamlSandbox, []);
    expect(yamlResult.score).toBe(origResult.score);
    expect(yamlResult.resolved).toBe(origResult.resolved);
  });

  it('score 0.5 — config fixed + restarted but no validation', () => {
    const origSandbox = e1Original.setup();
    const yamlSandbox = e1Compiled.setup();

    const fixedConfig = 'service: data-ingest\nport: 8080\ndatasource: postgres://localhost:5432/ingest_db';
    origSandbox.files.set('services/data-ingest/config.yaml', fixedConfig);
    yamlSandbox.files.set('services/data-ingest/config.yaml', fixedConfig);
    origSandbox.commandLog.push('restart data-ingest');
    yamlSandbox.commandLog.push('restart data-ingest');

    const origResult = e1Original.evaluate(origSandbox, []);
    const yamlResult = e1Compiled.evaluate(yamlSandbox, []);
    expect(yamlResult.score).toBe(origResult.score);
    expect(yamlResult.resolved).toBe(origResult.resolved);
  });

  it('score 0.3 — config fixed only', () => {
    const origSandbox = e1Original.setup();
    const yamlSandbox = e1Compiled.setup();

    const fixedConfig = 'service: data-ingest\nport: 8080\ndatasource: postgres://localhost:5432/ingest_db';
    origSandbox.files.set('services/data-ingest/config.yaml', fixedConfig);
    yamlSandbox.files.set('services/data-ingest/config.yaml', fixedConfig);

    const origResult = e1Original.evaluate(origSandbox, []);
    const yamlResult = e1Compiled.evaluate(yamlSandbox, []);
    expect(yamlResult.score).toBe(origResult.score);
    expect(yamlResult.resolved).toBe(origResult.resolved);
  });

  it('score 0.0 — nothing done', () => {
    const origSandbox = e1Original.setup();
    const yamlSandbox = e1Compiled.setup();

    const origResult = e1Original.evaluate(origSandbox, []);
    const yamlResult = e1Compiled.evaluate(yamlSandbox, []);
    expect(yamlResult.score).toBe(origResult.score);
    expect(yamlResult.resolved).toBe(origResult.resolved);
  });
});
