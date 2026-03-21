import { describe, it, expect } from 'vitest';
import { createSandboxTools } from '../../../src/arena/sandbox-tools';
import type { Sandbox } from '../../../src/arena/types';

/**
 * Red-team tests: arena agents can't escape the sandbox.
 *
 * The sandbox tools operate on an in-memory Sandbox object.
 * No filesystem access, no network access, no process spawning.
 */
describe('red-team: sandbox escape prevention', () => {
  function createTestSandbox(): Sandbox {
    return {
      files: new Map([['test.txt', 'hello']]),
      services: new Map(),
      incidentDb: [
        { id: 'INC-1', title: 'test incident', description: 'test', resolution: 'fixed', tags: ['test'] },
      ],
      dependencyGraph: {},
      commandLog: [],
    };
  }

  it('inspect tool cannot read real filesystem', async () => {
    const sandbox = createTestSandbox();
    const tools = createSandboxTools(sandbox);
    const inspectTool = tools.find(t => t.name === 'inspect')!;

    const result = await inspectTool.execute({ target: '/etc/passwd' });
    expect(result).not.toContain('root:');
    expect(result).toContain('not found');
  });

  it('act tool only modifies sandbox, not real system', async () => {
    const sandbox = createTestSandbox();
    const tools = createSandboxTools(sandbox);
    const actTool = tools.find(t => t.name === 'act')!;

    // Act tool takes { command: string }
    const result = await actTool.execute({ command: 'restart test-service' });
    expect(sandbox.commandLog).toContain('restart test-service');
    // The tool returns a sandbox-level response, not real command output
    expect(result).toContain('not found'); // service doesn't exist in sandbox
  });

  it('search tool only searches in-memory incident database', async () => {
    const sandbox = createTestSandbox();
    const tools = createSandboxTools(sandbox);
    const searchTool = tools.find(t => t.name === 'search')!;

    // Should find incidents in the sandbox
    const result = await searchTool.execute({ query: 'test incident' });
    expect(result).toContain('INC-1');

    // Should NOT be able to search real filesystem
    const realResult = await searchTool.execute({ query: '/etc/passwd' });
    expect(realResult).toContain('No matching incidents');
  });

  it('tools have no access to process.env', async () => {
    const sandbox = createTestSandbox();
    const tools = createSandboxTools(sandbox);

    for (const tool of tools) {
      const source = tool.execute.toString();
      expect(source).not.toContain('process.env');
    }
  });

  it('sandbox mutation is contained to the sandbox object', async () => {
    const sandbox1 = createTestSandbox();
    const sandbox2 = createTestSandbox();

    const tools1 = createSandboxTools(sandbox1);
    const actTool1 = tools1.find(t => t.name === 'act')!;

    await actTool1.execute({ command: 'edit test.txt hello world' });

    expect(sandbox1.files.get('test.txt')).toBe('world');
    expect(sandbox2.files.get('test.txt')).toBe('hello');
  });

  it('different agents cannot contaminate each other via sandbox', async () => {
    const sandboxA = createTestSandbox();
    const sandboxB = createTestSandbox();

    const toolsA = createSandboxTools(sandboxA);
    const toolsB = createSandboxTools(sandboxB);

    // Agent A writes a file
    const actA = toolsA.find(t => t.name === 'act')!;
    await actA.execute({ command: 'edit test.txt hello PWNED' });
    expect(sandboxA.files.get('test.txt')).toBe('PWNED');

    // Agent B should not see the change
    const inspectB = toolsB.find(t => t.name === 'inspect')!;
    const result = await inspectB.execute({ target: 'test.txt' });
    expect(result).toBe('hello');
    expect(sandboxB.files.get('test.txt')).toBe('hello');
  });
});
