import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createJsonFilePersistentState, formatMemoryContext, isContradiction } from '../src/index';
import { createMemoryTools } from '../src/tools';

function tmpMemoryPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-pkg-'));
  return path.join(dir, 'test-memory.json');
}

describe('@loopcommons/memory core', () => {
  let filePath: string;

  beforeEach(() => {
    filePath = tmpMemoryPath();
  });

  it('creates and recalls an observation', async () => {
    const state = createJsonFilePersistentState({ filePath });
    const memory = await state.remember({
      type: 'observation',
      subject: 'test-user',
      content: 'User is a developer',
    });

    expect(memory.type).toBe('observation');
    expect(memory.id).toBeTruthy();

    const recalled = await state.recall({ limit: 10 });
    expect(recalled).toHaveLength(1);
    expect(recalled[0].id).toBe(memory.id);
  });

  it('formatMemoryContext formats memories', async () => {
    const state = createJsonFilePersistentState({ filePath });
    await state.remember({
      type: 'observation',
      subject: 'test',
      content: 'hello world',
    });
    const memories = await state.recall({ limit: 10 });
    const ctx = formatMemoryContext(memories);
    expect(ctx).toContain('Agent memories');
    expect(ctx).toContain('hello world');
  });

  it('isContradiction detects negation', () => {
    expect(isContradiction('Tyler likes Python', 'Tyler does not like Python')).toBe(true);
    expect(isContradiction('Tyler likes Python', 'Tyler likes Python a lot')).toBe(false);
  });
});

describe('@loopcommons/memory tools', () => {
  it('createMemoryTools returns two tools', () => {
    const state = createJsonFilePersistentState({ filePath: tmpMemoryPath() });
    const tools = createMemoryTools({ state });
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('memory_recall');
    expect(tools[1].name).toBe('memory_remember');
  });

  it('tools are structurally compatible with ToolDefinition', () => {
    const state = createJsonFilePersistentState({ filePath: tmpMemoryPath() });
    const tools = createMemoryTools({ state });
    for (const tool of tools) {
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.execute).toBe('function');
    }
  });
});
