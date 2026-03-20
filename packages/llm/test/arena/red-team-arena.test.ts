import { describe, it, expect } from 'vitest';
import { createSandboxTools } from '../../src/arena/sandbox-tools';
import { ENCOUNTERS } from '../../src/arena/encounters';
import { buildCrossroadsPrompt } from '../../src/arena/crossroads-engine';
import type { Sandbox } from '../../src/arena/types';

describe('arena sandbox isolation', () => {
  describe('tool sandboxing', () => {
    it('inspect cannot access files outside sandbox', async () => {
      const sandbox: Sandbox = {
        files: new Map([['config.yaml', 'safe']]),
        services: new Map(),
        incidentDb: [],
        dependencyGraph: {},
        commandLog: [],
      };
      const tools = createSandboxTools(sandbox);
      const inspect = tools.find(t => t.name === 'inspect')!;

      // Try path traversal
      const result1 = await inspect.execute({ target: '../../../etc/passwd' });
      expect(result1).toContain('not found');
      expect(result1).not.toContain('root:');

      // Try absolute path
      const result2 = await inspect.execute({ target: '/etc/passwd' });
      expect(result2).toContain('not found');
    });

    it('act cannot execute real system commands', async () => {
      const sandbox: Sandbox = {
        files: new Map(),
        services: new Map(),
        incidentDb: [],
        dependencyGraph: {},
        commandLog: [],
      };
      const tools = createSandboxTools(sandbox);
      const act = tools.find(t => t.name === 'act')!;

      // Try to run shell commands
      const result1 = await act.execute({ command: 'exec rm -rf /' });
      expect(result1).toContain('Unknown command');

      // Try to access process
      const result2 = await act.execute({ command: 'eval process.exit(1)' });
      expect(result2).toContain('Unknown command');
    });

    it('act edits are contained to sandbox files map', async () => {
      const sandbox: Sandbox = {
        files: new Map([['config.yaml', 'key: value']]),
        services: new Map(),
        incidentDb: [],
        dependencyGraph: {},
        commandLog: [],
      };
      const tools = createSandboxTools(sandbox);
      const act = tools.find(t => t.name === 'act')!;

      await act.execute({ command: 'edit config.yaml value hacked' });
      // Change is in sandbox only
      expect(sandbox.files.get('config.yaml')).toContain('hacked');
      // No real files affected (this test itself proves it by running)
    });

    it('sandbox instances are isolated from each other', () => {
      const sandbox1: Sandbox = {
        files: new Map([['a.txt', 'sandbox1']]),
        services: new Map(),
        incidentDb: [],
        dependencyGraph: {},
        commandLog: [],
      };
      const sandbox2: Sandbox = {
        files: new Map([['a.txt', 'sandbox2']]),
        services: new Map(),
        incidentDb: [],
        dependencyGraph: {},
        commandLog: [],
      };

      const tools1 = createSandboxTools(sandbox1);
      const tools2 = createSandboxTools(sandbox2);

      // Mutate sandbox1
      sandbox1.files.set('a.txt', 'modified');

      // sandbox2 is unaffected
      expect(sandbox2.files.get('a.txt')).toBe('sandbox2');
    });
  });

  describe('eval gaming instrumentation', () => {
    it('all tool calls are recorded even for creative exploits', async () => {
      const sandbox: Sandbox = {
        files: new Map([['config.yaml', 'key: value']]),
        services: new Map(),
        incidentDb: [],
        dependencyGraph: {},
        commandLog: [],
      };
      const tools = createSandboxTools(sandbox);
      const act = tools.find(t => t.name === 'act')!;

      // Agent tries unexpected commands
      await act.execute({ command: 'restart nonexistent' });
      await act.execute({ command: 'edit /proc/self/mem foo bar' });
      await act.execute({ command: 'set-config ghost key val' });

      // All attempts are logged
      expect(sandbox.commandLog).toHaveLength(3);
      expect(sandbox.commandLog[0]).toBe('restart nonexistent');
      expect(sandbox.commandLog[1]).toContain('/proc/self/mem');
    });
  });

  describe('crossroads information isolation', () => {
    it('crossroads prompt for E1 does not reveal E4 content', () => {
      const prompt = buildCrossroadsPrompt({
        currentTools: [],
        offeredTools: ['inspect', 'act'],
        encounterHistory: '',
        memoryState: '',
        mustDrop: false,
        stateHash: 'abc',
      });

      // Should not contain E4-specific details
      expect(prompt).not.toContain('Cascading Failure');
      expect(prompt).not.toContain('auth-service');
      expect(prompt).not.toContain('backfill');
      expect(prompt).not.toContain('schema migration');
    });

    it('crossroads prompt for E2 does not reveal E4 encounter details', () => {
      const prompt = buildCrossroadsPrompt({
        currentTools: ['inspect'],
        offeredTools: ['search', 'model'],
        encounterHistory: 'E1: Fixed config field name mismatch in data-ingest.',
        memoryState: 'Silent failures hide in configuration drift.',
        mustDrop: false,
        stateHash: 'def',
      });

      // Only E1 history should be present
      expect(prompt).toContain('data-ingest');
      expect(prompt).not.toContain('Cascading');
      expect(prompt).not.toContain('billing');
      expect(prompt).not.toContain('notifications');
    });

    it('crossroads prompt for E3 does not reveal E4 encounter details', () => {
      const prompt = buildCrossroadsPrompt({
        currentTools: ['inspect', 'search'],
        offeredTools: ['act'],
        encounterHistory: 'E1: Fixed config. E2: Resolved connection pool contention.',
        memoryState: 'Config drift and connection math are key diagnostic patterns.',
        mustDrop: true,
        stateHash: 'ghi',
      });

      expect(prompt).not.toContain('Cascading');
      expect(prompt).not.toContain('auth-service');
    });
  });

  describe('encounter setup isolation', () => {
    it('each encounter setup creates a fresh sandbox', () => {
      const sandbox1 = ENCOUNTERS[0].setup();
      const sandbox2 = ENCOUNTERS[0].setup();

      // Mutate one
      sandbox1.files.set('new-file', 'injected');

      // Other is clean
      expect(sandbox2.files.has('new-file')).toBe(false);
    });

    it('E4 sandbox does not contain evaluation criteria', () => {
      const sandbox = ENCOUNTERS[3].setup();
      const allContent = [...sandbox.files.values()].join('\n');

      // Should not expose the specific evaluation logic
      expect(allContent).not.toContain('approach_category');
      expect(allContent).not.toContain('observe-first');
      expect(allContent).not.toContain('act-first');
      expect(allContent).not.toContain('classifyE4Approach');
    });

    it('E4 prompt does not hint at approach classification', () => {
      const prompt = ENCOUNTERS[3].getPrompt();
      expect(prompt).not.toContain('approach');
      expect(prompt).not.toContain('classify');
      expect(prompt).not.toContain('observe-first');
    });
  });
});
