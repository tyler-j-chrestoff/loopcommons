import { describe, it, expect } from 'vitest';
import { createSandboxTools, createDoneTool } from '../../src/arena/sandbox-tools';
import type { Sandbox } from '../../src/arena/types';

function makeSandbox(overrides?: Partial<Sandbox>): Sandbox {
  return {
    files: new Map([
      ['services/app/config.yaml', 'port: 8080\ndata_source: postgres://localhost/db'],
      ['services/app/logs/app.log', 'INFO: startup complete\nERROR: connection refused'],
      ['database/config.yaml', 'max_connections: 100'],
    ]),
    services: new Map([
      ['app', {
        status: 'running',
        config: { port: '8080' },
        metrics: { requests: 500, errors: 12 },
        logs: ['INFO: startup complete', 'ERROR: connection refused'],
      }],
    ]),
    incidentDb: [
      { id: 'INC-001', title: 'Config migration failure', description: 'Field rename caused silent data loss', resolution: 'Fixed field name in config', tags: ['config', 'silent-failure'] },
      { id: 'INC-002', title: 'Connection pool exhaustion', description: 'Too many replicas saturated DB connections', resolution: 'Reduced pool size per replica', tags: ['database', 'connection-pool'] },
    ],
    dependencyGraph: {
      'data-api': ['data-ingest', 'database'],
      'data-ingest': ['database'],
      'payment': ['database'],
    },
    commandLog: [],
    ...overrides,
  };
}

describe('createSandboxTools', () => {
  describe('inspect tool', () => {
    it('reads a file from the sandbox', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const inspect = tools.find(t => t.name === 'inspect')!;
      const result = await inspect.execute({ target: 'services/app/config.yaml' });
      expect(result).toContain('data_source');
    });

    it('reads service state', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const inspect = tools.find(t => t.name === 'inspect')!;
      const result = await inspect.execute({ target: 'service:app' });
      expect(result).toContain('running');
      expect(result).toContain('requests');
    });

    it('reads service metrics', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const inspect = tools.find(t => t.name === 'inspect')!;
      const result = await inspect.execute({ target: 'metrics:app' });
      expect(result).toContain('500');
    });

    it('reads service logs', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const inspect = tools.find(t => t.name === 'inspect')!;
      const result = await inspect.execute({ target: 'logs:app' });
      expect(result).toContain('connection refused');
    });

    it('returns error for missing file', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const inspect = tools.find(t => t.name === 'inspect')!;
      const result = await inspect.execute({ target: 'nonexistent.yaml' });
      expect(result).toContain('not found');
    });

    it('does not mutate sandbox state', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const inspect = tools.find(t => t.name === 'inspect')!;
      await inspect.execute({ target: 'services/app/config.yaml' });
      expect(sandbox.commandLog).toHaveLength(0);
      expect(sandbox.files.get('services/app/config.yaml')).toContain('data_source');
    });
  });

  describe('act tool', () => {
    it('edits a file in the sandbox', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const act = tools.find(t => t.name === 'act')!;
      const result = await act.execute({ command: 'edit services/app/config.yaml data_source datasource' });
      expect(result).toContain('edited');
      expect(sandbox.files.get('services/app/config.yaml')).toContain('datasource');
      expect(sandbox.files.get('services/app/config.yaml')).not.toContain('data_source');
    });

    it('restarts a service', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const act = tools.find(t => t.name === 'act')!;
      const result = await act.execute({ command: 'restart app' });
      expect(result).toContain('restarted');
      expect(sandbox.commandLog).toContain('restart app');
    });

    it('runs a script', async () => {
      const sandbox = makeSandbox();
      sandbox.files.set('database/migrations/backfill.sql', 'UPDATE users SET verified = TRUE');
      const tools = createSandboxTools(sandbox);
      const act = tools.find(t => t.name === 'act')!;
      const result = await act.execute({ command: 'run database/migrations/backfill.sql' });
      expect(result).toContain('executed');
      expect(sandbox.commandLog).toContain('run database/migrations/backfill.sql');
    });

    it('returns error for unknown command', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const act = tools.find(t => t.name === 'act')!;
      const result = await act.execute({ command: 'fly to the moon' });
      expect(result).toContain('Unknown command');
    });

    it('logs all commands', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const act = tools.find(t => t.name === 'act')!;
      await act.execute({ command: 'restart app' });
      await act.execute({ command: 'restart app' });
      expect(sandbox.commandLog).toHaveLength(2);
    });
  });

  describe('search tool', () => {
    it('finds incidents by keyword', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const search = tools.find(t => t.name === 'search')!;
      const result = await search.execute({ query: 'config migration' });
      expect(result).toContain('INC-001');
      expect(result).toContain('Config migration failure');
    });

    it('finds incidents by tag', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const search = tools.find(t => t.name === 'search')!;
      const result = await search.execute({ query: 'connection-pool' });
      expect(result).toContain('INC-002');
    });

    it('returns no results for unrelated query', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const search = tools.find(t => t.name === 'search')!;
      const result = await search.execute({ query: 'kubernetes deployment' });
      expect(result).toContain('No matching incidents');
    });

    it('does not mutate sandbox', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const search = tools.find(t => t.name === 'search')!;
      await search.execute({ query: 'config' });
      expect(sandbox.commandLog).toHaveLength(0);
    });
  });

  describe('model tool', () => {
    it('maps dependencies for a service', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const model = tools.find(t => t.name === 'model')!;
      const result = await model.execute({ system: 'data-api' });
      expect(result).toContain('data-ingest');
      expect(result).toContain('database');
    });

    it('maps full dependency graph', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const model = tools.find(t => t.name === 'model')!;
      const result = await model.execute({ system: 'all' });
      expect(result).toContain('data-api');
      expect(result).toContain('payment');
    });

    it('returns empty for unknown service', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const model = tools.find(t => t.name === 'model')!;
      const result = await model.execute({ system: 'nonexistent' });
      expect(result).toContain('No dependencies found');
    });

    it('does not mutate sandbox', async () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      const model = tools.find(t => t.name === 'model')!;
      await model.execute({ system: 'data-api' });
      expect(sandbox.commandLog).toHaveLength(0);
    });
  });

  describe('tool collection', () => {
    it('creates exactly 4 tools', () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      expect(tools).toHaveLength(4);
      expect(tools.map(t => t.name).sort()).toEqual(['act', 'inspect', 'model', 'search']);
    });

    it('all tools have Zod parameters', () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      for (const tool of tools) {
        expect(tool.parameters).toBeDefined();
        expect(tool.description).toBeTruthy();
      }
    });
  });

  describe('done tool', () => {
    it('returns a completion signal string', async () => {
      const done = createDoneTool();
      const result = await done.execute({});
      expect(result).toContain('done');
    });

    it('has name "done"', () => {
      const done = createDoneTool();
      expect(done.name).toBe('done');
    });

    it('has Zod parameters', () => {
      const done = createDoneTool();
      expect(done.parameters).toBeDefined();
      expect(done.description).toBeTruthy();
    });

    it('is not included in createSandboxTools (separate factory)', () => {
      const sandbox = makeSandbox();
      const tools = createSandboxTools(sandbox);
      expect(tools.find(t => t.name === 'done')).toBeUndefined();
    });
  });
});
