/**
 * memory-tools.test.ts — Tests for createMemoryTools factory.
 *
 * memory_recall and memory_remember tools backed by PersistentState.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createJsonFilePersistentState, type PersistentState } from '../src/memory';
import { createMemoryTools } from '../src/memory/tools';
import type { ToolDefinition } from '../src/tool';

function tmpMemoryPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-tools-'));
  return path.join(dir, 'world-model.json');
}

describe('createMemoryTools', () => {
  let memPath: string;
  let state: PersistentState;
  let tools: ToolDefinition<any>[];

  beforeEach(() => {
    memPath = tmpMemoryPath();
    state = createJsonFilePersistentState({ filePath: memPath });
    tools = createMemoryTools({ state });
  });

  afterEach(() => {
    try {
      fs.rmSync(path.dirname(memPath), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // =========================================================================
  // Factory
  // =========================================================================
  it('returns two tools: memory_recall and memory_remember', () => {
    expect(tools).toHaveLength(2);
    const names = tools.map((t) => t.name);
    expect(names).toContain('memory_recall');
    expect(names).toContain('memory_remember');
  });

  it('tools have descriptions suitable for derived prompts', () => {
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  // =========================================================================
  // memory_remember — stores memories
  // =========================================================================
  describe('memory_remember', () => {
    let rememberTool: ToolDefinition<any>;

    beforeEach(() => {
      rememberTool = tools.find((t) => t.name === 'memory_remember')!;
    });

    it('stores an observation', async () => {
      const result = JSON.parse(
        await rememberTool.execute({
          type: 'observation',
          subject: 'Tyler',
          content: 'is a data engineer',
          tags: ['user-info'],
        })
      );

      expect(result.stored).toBeDefined();
      expect(result.stored.type).toBe('observation');
      expect(result.stored.subject).toBe('Tyler');
    });

    it('stores a learning', async () => {
      const result = JSON.parse(
        await rememberTool.execute({
          type: 'learning',
          topic: 'code-style',
          insight: 'prefers TDD',
          tags: ['preferences'],
        })
      );

      expect(result.stored.type).toBe('learning');
      expect(result.stored.topic).toBe('code-style');
    });

    it('stores a relationship', async () => {
      const result = JSON.parse(
        await rememberTool.execute({
          type: 'relationship',
          entity: 'Tyler',
          context: 'project creator',
          tags: [],
        })
      );

      expect(result.stored.type).toBe('relationship');
      expect(result.stored.entity).toBe('Tyler');
    });

    it('stores a reflection', async () => {
      const result = JSON.parse(
        await rememberTool.execute({
          type: 'reflection',
          insight: 'User is a researcher',
          evidence: [],
          tags: [],
        })
      );

      expect(result.stored.type).toBe('reflection');
      expect(result.stored.significance).toBe('minor');
    });

    it('returns error for observation missing subject', async () => {
      const result = JSON.parse(
        await rememberTool.execute({
          type: 'observation',
          content: 'no subject',
        })
      );

      expect(result.error).toBeDefined();
    });

    it('returns error for learning missing topic', async () => {
      const result = JSON.parse(
        await rememberTool.execute({
          type: 'learning',
          insight: 'no topic',
        })
      );

      expect(result.error).toBeDefined();
    });

    it('returns error for relationship missing entity', async () => {
      const result = JSON.parse(
        await rememberTool.execute({
          type: 'relationship',
          context: 'no entity',
        })
      );

      expect(result.error).toBeDefined();
    });

    it('returns error for reflection missing insight', async () => {
      const result = JSON.parse(
        await rememberTool.execute({
          type: 'reflection',
          evidence: [],
        })
      );

      expect(result.error).toBeDefined();
    });
  });

  // =========================================================================
  // memory_recall — retrieves memories
  // =========================================================================
  describe('memory_recall', () => {
    let recallTool: ToolDefinition<any>;
    let rememberTool: ToolDefinition<any>;

    beforeEach(async () => {
      recallTool = tools.find((t) => t.name === 'memory_recall')!;
      rememberTool = tools.find((t) => t.name === 'memory_remember')!;

      // Seed some memories
      await rememberTool.execute({
        type: 'observation',
        subject: 'Tyler',
        content: 'is a data engineer',
        tags: ['user'],
      });
      await rememberTool.execute({
        type: 'learning',
        topic: 'response-style',
        insight: 'prefers concise',
        tags: ['preferences'],
      });
    });

    it('recalls all memories with no filters', async () => {
      const result = JSON.parse(await recallTool.execute({}));
      expect(result.memories.length).toBe(2);
      expect(result.count).toBe(2);
    });

    it('recalls by type', async () => {
      const result = JSON.parse(await recallTool.execute({ type: 'observation' }));
      expect(result.memories.length).toBe(1);
      expect(result.memories[0].type).toBe('observation');
    });

    it('recalls by tags', async () => {
      const result = JSON.parse(await recallTool.execute({ tags: ['preferences'] }));
      expect(result.memories.length).toBe(1);
      expect(result.memories[0].type).toBe('learning');
    });

    it('respects limit', async () => {
      const result = JSON.parse(await recallTool.execute({ limit: 1 }));
      expect(result.memories.length).toBe(1);
    });

    it('filters by query (substring match on content fields)', async () => {
      const result = JSON.parse(await recallTool.execute({ query: 'data engineer' }));
      expect(result.memories.length).toBe(1);
      expect(result.memories[0].subject).toBe('Tyler');
    });

    it('query returns empty for no match', async () => {
      const result = JSON.parse(await recallTool.execute({ query: 'nonexistent xyz' }));
      expect(result.memories.length).toBe(0);
    });

    // -----------------------------------------------------------------------
    // Multi-word query matching (bug fix: full-string substring → tokenized)
    // -----------------------------------------------------------------------
    it('matches multi-word query when words appear across fields', async () => {
      // "Tyler data engineer" — each word appears in subject or content
      const result = JSON.parse(await recallTool.execute({ query: 'Tyler data engineer' }));
      expect(result.memories.length).toBe(1);
      expect(result.memories[0].subject).toBe('Tyler');
    });

    it('matches query words in any order', async () => {
      const result = JSON.parse(await recallTool.execute({ query: 'engineer data Tyler' }));
      expect(result.memories.length).toBe(1);
      expect(result.memories[0].subject).toBe('Tyler');
    });

    it('matches partial words within tokens', async () => {
      // "concise" appears in insight "prefers concise"
      const result = JSON.parse(await recallTool.execute({ query: 'response concise style' }));
      expect(result.memories.length).toBe(1);
      expect(result.memories[0].type).toBe('learning');
    });

    it('requires all query words to match (AND semantics)', async () => {
      // "Tyler" matches observation but "quantum" does not
      const result = JSON.parse(await recallTool.execute({ query: 'Tyler quantum' }));
      expect(result.memories.length).toBe(0);
    });

    it('single-word query still works as before', async () => {
      const result = JSON.parse(await recallTool.execute({ query: 'Tyler' }));
      expect(result.memories.length).toBe(1);
      expect(result.memories[0].subject).toBe('Tyler');
    });

    it('is case-insensitive for multi-word queries', async () => {
      const result = JSON.parse(await recallTool.execute({ query: 'TYLER DATA ENGINEER' }));
      expect(result.memories.length).toBe(1);
    });
  });
});
