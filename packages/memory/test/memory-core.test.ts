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

describe('vector field', () => {
  let filePath: string;

  beforeEach(() => {
    filePath = tmpMemoryPath();
  });

  it('memory schema accepts optional vector field', async () => {
    const state = createJsonFilePersistentState({ filePath });
    const memory = await state.remember({
      type: 'observation',
      subject: 'test',
      content: 'hello',
      vector: [0.1, 0.2, 0.3],
    });

    expect(memory.vector).toEqual([0.1, 0.2, 0.3]);
  });

  it('memories without vector field still work (backward compat)', async () => {
    const state = createJsonFilePersistentState({ filePath });
    const memory = await state.remember({
      type: 'observation',
      subject: 'test',
      content: 'hello',
    });

    expect(memory.vector).toBeUndefined();
  });

  it('vector field persists through serialization round-trip', async () => {
    const state = createJsonFilePersistentState({ filePath });
    await state.remember({
      type: 'observation',
      subject: 'test',
      content: 'hello',
      vector: [0.1, 0.2, 0.3],
    });

    // Create a new state from the same file — tests deserialization
    const state2 = createJsonFilePersistentState({ filePath });
    const recalled = await state2.recall({ limit: 10 });
    expect(recalled[0].vector).toEqual([0.1, 0.2, 0.3]);
  });

  it('vector field works on all memory types', async () => {
    const state = createJsonFilePersistentState({ filePath });

    const obs = await state.remember({
      type: 'observation', subject: 'a', content: 'b', vector: [1, 2],
    });
    const learn = await state.remember({
      type: 'learning', topic: 'x', insight: 'y', vector: [3, 4],
    });
    const rel = await state.remember({
      type: 'relationship', entity: 'e', context: 'c', vector: [5, 6],
    });
    const refl = await state.remember({
      type: 'reflection', insight: 'i', evidence: [], significance: 'minor', vector: [7, 8],
    });

    expect(obs.vector).toEqual([1, 2]);
    expect(learn.vector).toEqual([3, 4]);
    expect(rel.vector).toEqual([5, 6]);
    expect(refl.vector).toEqual([7, 8]);
  });

  it('dedup preserves vector on superseded entry', async () => {
    const state = createJsonFilePersistentState({ filePath });
    await state.remember({
      type: 'observation', subject: 'user', content: 'likes Python', vector: [0.1],
    });
    const updated = await state.remember({
      type: 'observation', subject: 'user', content: 'loves Python', vector: [0.9],
    });

    expect(updated.vector).toEqual([0.9]);
  });

  it('existing JSON without vector field loads cleanly', async () => {
    // Simulate legacy data: entries without vector
    const legacy = [{
      type: 'observation',
      id: 'legacy-1',
      subject: 'test',
      content: 'old entry',
      provenance: { agent: 'test', timestamp: '2026-01-01T00:00:00Z', used: [] },
      modality: 'observation',
      uncertainty: 0.5,
      visibility: 'local',
      tags: [],
      updatedAt: '2026-01-01T00:00:00Z',
      accessCount: 0,
    }];
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(legacy));

    const state = createJsonFilePersistentState({ filePath });
    const recalled = await state.recall({ limit: 10 });
    expect(recalled).toHaveLength(1);
    expect(recalled[0].vector).toBeUndefined();
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
