/**
 * memory-continuity.test.ts — Cross-session continuity integration test.
 *
 * mem-11: Verifies that memories persist across PersistentState instances
 * (simulating cross-session continuity) and that formatMemoryContext
 * produces usable context strings.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createJsonFilePersistentState,
  formatMemoryContext,
  type PersistentState,
  type ObservationMemory,
} from '../src/memory';
import { extractMemoryWrites } from '../src/memory/extract';
import type { AmygdalaResult } from '../src/amygdala/types';

function tmpMemoryPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-continuity-'));
  return path.join(dir, 'world-model.json');
}

function mockAmygdalaResult(overrides: Partial<AmygdalaResult> = {}): AmygdalaResult {
  return {
    rewrittenPrompt: 'test',
    intent: 'conversation',
    threat: { score: 0.05, category: 'none', reasoning: 'safe' },
    contextDelegation: { historyIndices: [], annotations: [] },
    traceEvents: [],
    latencyMs: 50,
    usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 0 },
    cost: 0.001,
    ...overrides,
  };
}

describe('Cross-session memory continuity', () => {
  let memPath: string;

  afterEach(() => {
    try {
      fs.rmSync(path.dirname(memPath), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('memories from session 1 are available in session 2', async () => {
    memPath = tmpMemoryPath();

    // --- Session 1: User introduces themselves ---
    const state1 = createJsonFilePersistentState({ filePath: memPath });

    const amygdalaResult1 = mockAmygdalaResult({
      intent: 'conversation',
      threat: { score: 0.05, category: 'none', reasoning: 'genuine introduction' },
    });

    const writes1 = extractMemoryWrites(
      'I am researching consciousness and how AI systems can be made more self-aware',
      amygdalaResult1,
    );

    expect(writes1.length).toBeGreaterThan(0);

    // Simulate route.ts write behavior
    for (const write of writes1) {
      await state1.remember(write);
    }

    // Verify written to disk
    const stats1 = await state1.stats();
    expect(stats1.totalEntries).toBeGreaterThan(0);

    // --- Session 2: New PersistentState instance (same file) ---
    const state2 = createJsonFilePersistentState({ filePath: memPath });

    const recalled = await state2.recall({});
    expect(recalled.length).toBeGreaterThan(0);

    // Format as memoryContext for the amygdala
    const memoryContext = formatMemoryContext(recalled);
    expect(memoryContext).toContain('Agent memories');
    expect(memoryContext).toContain('consciousness');

    // Verify the context string is non-empty and informative
    expect(memoryContext.length).toBeGreaterThan(20);
  });

  it('deduplication reinforces across sessions', async () => {
    memPath = tmpMemoryPath();

    // --- Session 1: First observation ---
    const state1 = createJsonFilePersistentState({ filePath: memPath });
    const entry1 = await state1.remember({
      type: 'observation',
      subject: 'user-interest',
      content: 'interested in consciousness research',
      tags: ['conversation'],
    });
    const initialUncertainty = entry1.uncertainty;

    // --- Session 2: Same observation (reinforcement) ---
    const state2 = createJsonFilePersistentState({ filePath: memPath });
    await state2.remember({
      type: 'observation',
      subject: 'user-interest',
      content: 'deeply interested in consciousness and AI self-awareness',
      tags: ['conversation'],
    });

    const recalled = await state2.recall({ type: 'observation' });
    expect(recalled).toHaveLength(1); // Deduplicated — only one active entry
    expect(recalled[0].uncertainty).toBeLessThan(initialUncertainty); // Reinforced
    expect((recalled[0] as ObservationMemory).content).toContain('self-awareness'); // Updated content
  });

  it('relationship memory persists and informs future sessions', async () => {
    memPath = tmpMemoryPath();

    // --- Session 1: Build relationship ---
    const state1 = createJsonFilePersistentState({ filePath: memPath });
    await state1.remember({
      type: 'relationship',
      entity: 'Tyler',
      context: 'Project creator, interested in consciousness research',
      tags: ['user'],
    });

    // --- Session 2: Recall relationship ---
    const state2 = createJsonFilePersistentState({ filePath: memPath });
    const recalled = await state2.recall({ type: 'relationship' });
    expect(recalled).toHaveLength(1);

    const ctx = formatMemoryContext(recalled);
    expect(ctx).toContain('Tyler');
    expect(ctx).toContain('relationship');
    expect(ctx).toContain('rapport');
  });

  it('reflection with evidence chain persists', async () => {
    memPath = tmpMemoryPath();

    // --- Session 1: Create observations + reflection ---
    const state1 = createJsonFilePersistentState({ filePath: memPath });

    const obs1 = await state1.remember({
      type: 'observation',
      subject: 'user-focus',
      content: 'asks about amygdala architecture',
      tags: ['technical'],
    });

    const obs2 = await state1.remember({
      type: 'observation',
      subject: 'user-focus',
      content: 'interested in security through self-knowledge',
      tags: ['security'],
    });

    await state1.remember({
      type: 'reflection',
      insight: 'User is deeply engaged with the substrate-awareness thesis',
      evidence: [obs1.id, obs2.id],
      significance: 'notable',
      tags: ['meta'],
    });

    // --- Session 2: Recall shows reflection with evidence ---
    const state2 = createJsonFilePersistentState({ filePath: memPath });
    const reflections = await state2.recall({ type: 'reflection' });
    expect(reflections).toHaveLength(1);
    expect(reflections[0].provenance.used).toContain(obs1.id);
    expect(reflections[0].provenance.used).toContain(obs2.id);

    const ctx = formatMemoryContext(reflections);
    expect(ctx).toContain('substrate-awareness');
    expect(ctx).toContain('significance: notable');
  });
});
