/**
 * memory.test.ts — Tests for the agent memory module (PersistentState + JsonFilePersistentState).
 *
 * RED-GREEN TDD: Tests written first (RED), then implementation follows (GREEN).
 * mem-06: PersistentState interface, capsule-shaped types, JSON persistence.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createJsonFilePersistentState,
  type PersistentState,
  type Memory,
  type ObservationMemory,
  type LearningMemory,
  type RelationshipMemory,
  type ReflectionMemory,
} from '../src/memory';

function tmpMemoryPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-mem-'));
  return path.join(dir, 'world-model.json');
}

describe('PersistentState (JsonFilePersistentState)', () => {
  let memPath: string;
  let state: PersistentState;

  beforeEach(() => {
    memPath = tmpMemoryPath();
    state = createJsonFilePersistentState({ filePath: memPath });
  });

  afterEach(() => {
    try {
      fs.rmSync(path.dirname(memPath), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // =========================================================================
  // 1. Empty store
  // =========================================================================
  it('recall returns empty array on fresh store', async () => {
    const result = await state.recall({});
    expect(result).toEqual([]);
  });

  it('stats returns zero counts on fresh store', async () => {
    const stats = await state.stats();
    expect(stats.totalEntries).toBe(0);
    expect(stats.byType).toEqual({
      observation: 0,
      learning: 0,
      relationship: 0,
      reflection: 0,
    });
    expect(stats.oldestEntry).toBeUndefined();
    expect(stats.newestEntry).toBeUndefined();
  });

  // =========================================================================
  // 2. Remember + recall each type
  // =========================================================================
  it('stores and recalls an observation', async () => {
    const entry = await state.remember({
      type: 'observation',
      subject: 'Tyler',
      content: 'is a data engineer',
      tags: ['user-info'],
    });

    expect(entry.id).toBeDefined();
    expect(entry.type).toBe('observation');
    expect(entry.provenance.agent).toBe('loop-commons-agent');
    expect(entry.provenance.timestamp).toBeDefined();
    expect(entry.modality).toBe('observation');
    expect(entry.uncertainty).toBeGreaterThanOrEqual(0);
    expect(entry.uncertainty).toBeLessThanOrEqual(1);
    expect(entry.visibility).toBe('local');
    expect(entry.accessCount).toBe(0);
    expect((entry as ObservationMemory).subject).toBe('Tyler');
    expect((entry as ObservationMemory).content).toBe('is a data engineer');

    const recalled = await state.recall({ type: 'observation' });
    expect(recalled).toHaveLength(1);
    expect(recalled[0].id).toBe(entry.id);
  });

  it('stores and recalls a learning', async () => {
    const entry = await state.remember({
      type: 'learning',
      topic: 'response-style',
      insight: 'User prefers concise responses',
      tags: ['preferences'],
    });

    expect(entry.type).toBe('learning');
    expect(entry.modality).toBe('belief');
    expect((entry as LearningMemory).topic).toBe('response-style');
    expect((entry as LearningMemory).insight).toBe('User prefers concise responses');
    expect((entry as LearningMemory).applicableTo).toEqual([]);

    const recalled = await state.recall({ type: 'learning' });
    expect(recalled).toHaveLength(1);
  });

  it('stores and recalls a relationship', async () => {
    const entry = await state.remember({
      type: 'relationship',
      entity: 'Tyler',
      context: 'Project creator, senior data engineer',
      tags: ['user'],
    });

    expect(entry.type).toBe('relationship');
    expect(entry.modality).toBe('claim');
    expect((entry as RelationshipMemory).entity).toBe('Tyler');
    expect((entry as RelationshipMemory).rapport).toBeGreaterThanOrEqual(0);
    expect((entry as RelationshipMemory).rapport).toBeLessThanOrEqual(1);

    const recalled = await state.recall({ type: 'relationship' });
    expect(recalled).toHaveLength(1);
  });

  it('stores and recalls a reflection', async () => {
    const obs = await state.remember({
      type: 'observation',
      subject: 'user',
      content: 'interested in consciousness',
      tags: [],
    });

    const entry = await state.remember({
      type: 'reflection',
      insight: 'User is building a research platform, not a portfolio',
      evidence: [obs.id],
      significance: 'major',
      tags: ['meta'],
    });

    expect(entry.type).toBe('reflection');
    expect(entry.modality).toBe('hypothesis');
    expect((entry as ReflectionMemory).insight).toBe(
      'User is building a research platform, not a portfolio'
    );
    expect((entry as ReflectionMemory).evidence).toEqual([obs.id]);
    expect((entry as ReflectionMemory).significance).toBe('major');
    expect(entry.provenance.used).toEqual([obs.id]);

    const recalled = await state.recall({ type: 'reflection' });
    expect(recalled).toHaveLength(1);
  });

  // =========================================================================
  // 3. Recall filtering
  // =========================================================================
  it('recall filters by type', async () => {
    await state.remember({ type: 'observation', subject: 'a', content: 'b', tags: [] });
    await state.remember({ type: 'learning', topic: 'c', insight: 'd', tags: [] });
    await state.remember({
      type: 'relationship',
      entity: 'e',
      context: 'f',
      tags: [],
    });

    expect(await state.recall({ type: 'observation' })).toHaveLength(1);
    expect(await state.recall({ type: 'learning' })).toHaveLength(1);
    expect(await state.recall({ type: 'relationship' })).toHaveLength(1);
    expect(await state.recall({ type: 'reflection' })).toHaveLength(0);
  });

  it('recall filters by tags (AND logic)', async () => {
    await state.remember({
      type: 'observation',
      subject: 'x',
      content: 'y',
      tags: ['alpha', 'beta'],
    });
    await state.remember({
      type: 'observation',
      subject: 'z',
      content: 'w',
      tags: ['gamma'],
    });

    expect(await state.recall({ tags: ['alpha'] })).toHaveLength(1);
    expect(await state.recall({ tags: ['alpha', 'beta'] })).toHaveLength(1);
    expect(await state.recall({ tags: ['alpha', 'gamma'] })).toHaveLength(0);
    expect(await state.recall({ tags: ['delta'] })).toHaveLength(0);
  });

  it('recall respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await state.remember({
        type: 'observation',
        subject: `s${i}`,
        content: `c${i}`,
        tags: [],
      });
    }

    const result = await state.recall({ limit: 3 });
    expect(result).toHaveLength(3);
  });

  it('recall excludes superseded entries by default', async () => {
    const original = await state.remember({
      type: 'observation',
      subject: 'fact',
      content: 'old info',
      tags: [],
    });

    // Duplicate observation supersedes original
    await state.remember({
      type: 'observation',
      subject: 'fact',
      content: 'new info',
      tags: [],
    });

    const defaultRecall = await state.recall({});
    expect(defaultRecall).toHaveLength(1);
    expect((defaultRecall[0] as ObservationMemory).content).toBe('new info');

    const withSuperseded = await state.recall({ includeSuperseded: true });
    expect(withSuperseded).toHaveLength(2);
  });

  // =========================================================================
  // 4. Deduplication
  // =========================================================================
  it('deduplicates observations by subject — updates content, decreases uncertainty', async () => {
    const first = await state.remember({
      type: 'observation',
      subject: 'Tyler',
      content: 'is an engineer',
      tags: [],
      uncertainty: 0.5,
    });

    const second = await state.remember({
      type: 'observation',
      subject: 'Tyler',
      content: 'is a senior data engineer',
      tags: [],
    });

    const recalled = await state.recall({ type: 'observation' });
    // One active entry (the superseding one)
    expect(recalled).toHaveLength(1);
    expect((recalled[0] as ObservationMemory).content).toBe('is a senior data engineer');
    expect(recalled[0].uncertainty).toBeLessThan(0.5); // decreased by 0.1
    expect(recalled[0].id).not.toBe(first.id); // new entry
    expect(second.id).toBe(recalled[0].id);
  });

  it('deduplicates learnings by topic — updates insight', async () => {
    await state.remember({
      type: 'learning',
      topic: 'code-style',
      insight: 'prefers functions',
      tags: [],
      uncertainty: 0.4,
    });

    await state.remember({
      type: 'learning',
      topic: 'code-style',
      insight: 'prefers functional style with immutability',
      tags: [],
    });

    const recalled = await state.recall({ type: 'learning' });
    expect(recalled).toHaveLength(1);
    expect((recalled[0] as LearningMemory).insight).toBe(
      'prefers functional style with immutability'
    );
    expect(recalled[0].uncertainty).toBeLessThan(0.4);
  });

  it('deduplicates relationships by entity — updates context and rapport', async () => {
    await state.remember({
      type: 'relationship',
      entity: 'Tyler',
      context: 'project creator',
      tags: [],
    });

    await state.remember({
      type: 'relationship',
      entity: 'Tyler',
      context: 'project creator, consciousness researcher',
      tags: [],
    });

    const recalled = await state.recall({ type: 'relationship' });
    expect(recalled).toHaveLength(1);
    expect((recalled[0] as RelationshipMemory).context).toBe(
      'project creator, consciousness researcher'
    );
  });

  it('does NOT deduplicate reflections — each is unique', async () => {
    await state.remember({
      type: 'reflection',
      insight: 'insight 1',
      evidence: [],
      significance: 'minor',
      tags: [],
    });
    await state.remember({
      type: 'reflection',
      insight: 'insight 2',
      evidence: [],
      significance: 'minor',
      tags: [],
    });

    const recalled = await state.recall({ type: 'reflection' });
    expect(recalled).toHaveLength(2);
  });

  // =========================================================================
  // 5. Uncertainty reinforcement
  // =========================================================================
  it('uncertainty decreases by 0.1 on dedup, capped at 0.05', async () => {
    await state.remember({
      type: 'observation',
      subject: 's',
      content: 'c',
      tags: [],
      uncertainty: 0.15,
    });

    await state.remember({
      type: 'observation',
      subject: 's',
      content: 'c updated',
      tags: [],
    });

    const recalled = await state.recall({ type: 'observation' });
    expect(recalled[0].uncertainty).toBe(0.05); // 0.15 - 0.1 = 0.05 (at cap)
  });

  it('uncertainty does not go below 0.05', async () => {
    await state.remember({
      type: 'observation',
      subject: 's',
      content: 'c',
      tags: [],
      uncertainty: 0.08,
    });

    await state.remember({
      type: 'observation',
      subject: 's',
      content: 'c again',
      tags: [],
    });

    const recalled = await state.recall({ type: 'observation' });
    expect(recalled[0].uncertainty).toBe(0.05);
  });

  // =========================================================================
  // 6. Sorting
  // =========================================================================
  it('recall sorts by uncertainty asc then updatedAt desc', async () => {
    await state.remember({
      type: 'observation',
      subject: 'high-uncertainty',
      content: 'a',
      tags: [],
      uncertainty: 0.8,
    });
    // small delay to ensure different timestamps
    await state.remember({
      type: 'observation',
      subject: 'low-uncertainty',
      content: 'b',
      tags: [],
      uncertainty: 0.2,
    });

    const recalled = await state.recall({ type: 'observation' });
    expect(recalled).toHaveLength(2);
    expect(recalled[0].uncertainty).toBeLessThanOrEqual(recalled[1].uncertainty);
  });

  // =========================================================================
  // 7. Stats
  // =========================================================================
  it('stats returns correct counts by type', async () => {
    await state.remember({ type: 'observation', subject: 'a', content: 'b', tags: [] });
    await state.remember({ type: 'observation', subject: 'c', content: 'd', tags: [] });
    await state.remember({ type: 'learning', topic: 'e', insight: 'f', tags: [] });
    await state.remember({
      type: 'relationship',
      entity: 'g',
      context: 'h',
      tags: [],
    });

    const stats = await state.stats();
    expect(stats.totalEntries).toBe(4);
    expect(stats.byType.observation).toBe(2);
    expect(stats.byType.learning).toBe(1);
    expect(stats.byType.relationship).toBe(1);
    expect(stats.byType.reflection).toBe(0);
    expect(stats.oldestEntry).toBeDefined();
    expect(stats.newestEntry).toBeDefined();
  });

  // =========================================================================
  // 8. Persistence — survives reload
  // =========================================================================
  it('persists to disk and reloads', async () => {
    await state.remember({
      type: 'observation',
      subject: 'persist-test',
      content: 'survives reload',
      tags: ['disk'],
    });

    const state2 = createJsonFilePersistentState({ filePath: memPath });
    const recalled = await state2.recall({});
    expect(recalled).toHaveLength(1);
    expect((recalled[0] as ObservationMemory).subject).toBe('persist-test');
  });

  // =========================================================================
  // 9. Access count increments on recall
  // =========================================================================
  it('increments accessCount when memories are recalled', async () => {
    await state.remember({
      type: 'observation',
      subject: 'access-test',
      content: 'track me',
      tags: [],
    });

    // First recall
    const first = await state.recall({});
    expect(first[0].accessCount).toBe(1);

    // Second recall
    const second = await state.recall({});
    expect(second[0].accessCount).toBe(2);
  });

  // =========================================================================
  // 10. Default uncertainty by type
  // =========================================================================
  it('applies default uncertainty per type when not specified', async () => {
    const obs = await state.remember({
      type: 'observation',
      subject: 'a',
      content: 'b',
      tags: [],
    });
    expect(obs.uncertainty).toBeGreaterThanOrEqual(0.3);
    expect(obs.uncertainty).toBeLessThanOrEqual(0.7);

    const learning = await state.remember({
      type: 'learning',
      topic: 'c',
      insight: 'd',
      tags: [],
    });
    expect(learning.uncertainty).toBeGreaterThanOrEqual(0.3);
    expect(learning.uncertainty).toBeLessThanOrEqual(0.5);

    const rel = await state.remember({
      type: 'relationship',
      entity: 'e',
      context: 'f',
      tags: [],
    });
    expect(rel.uncertainty).toBeGreaterThanOrEqual(0.2);
    expect(rel.uncertainty).toBeLessThanOrEqual(0.4);

    const ref = await state.remember({
      type: 'reflection',
      insight: 'g',
      evidence: [],
      significance: 'minor',
      tags: [],
    });
    expect(ref.uncertainty).toBeGreaterThanOrEqual(0.4);
    expect(ref.uncertainty).toBeLessThanOrEqual(0.7);
  });

  // =========================================================================
  // 11. Provenance fields
  // =========================================================================
  it('populates provenance with agent, timestamp, used, source', async () => {
    const entry = await state.remember({
      type: 'observation',
      subject: 'provenance-test',
      content: 'verify fields',
      tags: [],
    });

    expect(entry.provenance.agent).toBe('loop-commons-agent');
    expect(new Date(entry.provenance.timestamp).getTime()).not.toBeNaN();
    expect(entry.provenance.used).toEqual([]);
    expect(entry.provenance.source).toBe('conversation');
  });

  // =========================================================================
  // 12. Visibility defaults to local
  // =========================================================================
  it('defaults visibility to local', async () => {
    const entry = await state.remember({
      type: 'observation',
      subject: 'vis-test',
      content: 'check visibility',
      tags: [],
    });

    expect(entry.visibility).toBe('local');
  });
});
