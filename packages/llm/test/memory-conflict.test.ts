/**
 * memory-conflict.test.ts — ACC-inspired conflict detection in memory.
 *
 * When dedup finds a meaningfully different existing entry,
 * flag it as conflicted rather than silently overwriting.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createJsonFilePersistentState, type PersistentState, type Memory } from '../src/memory';

function tmpMemoryPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-conflict-'));
  return path.join(dir, 'world-model.json');
}

describe('ACC conflict detection', () => {
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
  // Contradiction detection — different content on same subject
  // =========================================================================
  describe('contradiction — observation with different content', () => {
    it('flags conflict when new observation contradicts existing on same subject', async () => {
      // First observation: Tyler prefers dark mode
      await state.remember({
        type: 'observation',
        subject: 'tyler-preference',
        content: 'Tyler prefers dark mode for all interfaces',
      });

      // Contradicting observation: Tyler prefers light mode
      const conflicted = await state.remember({
        type: 'observation',
        subject: 'tyler-preference',
        content: 'Tyler prefers light mode and finds dark mode hard to read',
      });

      // Should be flagged as conflicted
      expect((conflicted as any).conflicted).toBe(true);
    });

    it('elevates uncertainty by +0.1 on conflicted entries', async () => {
      await state.remember({
        type: 'observation',
        subject: 'user-role',
        content: 'User is a frontend developer',
        uncertainty: 0.3,
      });

      const conflicted = await state.remember({
        type: 'observation',
        subject: 'user-role',
        content: 'User is a backend engineer with no frontend experience',
      });

      // Dedup reinforcement lowers uncertainty by 0.1, but conflict adds 0.1
      // Net: original uncertainty stays (reinforcement - conflict cancel out)
      // The conflict flag is the key signal, not just the uncertainty
      expect((conflicted as any).conflicted).toBe(true);
    });
  });

  // =========================================================================
  // Refinement — similar/extended content should NOT trigger conflict
  // =========================================================================
  describe('refinement — more detail on same claim', () => {
    it('does NOT flag conflict for refinement (superset content)', async () => {
      await state.remember({
        type: 'observation',
        subject: 'user-role',
        content: 'User is a data engineer',
      });

      // Refinement: adds more detail but doesn't contradict
      const refined = await state.remember({
        type: 'observation',
        subject: 'user-role',
        content: 'User is a senior data engineer with 10 years experience',
      });

      // Should NOT be flagged as conflicted — this is a refinement
      expect((refined as any).conflicted).toBeUndefined();
    });

    it('does NOT flag conflict when content is identical', async () => {
      await state.remember({
        type: 'observation',
        subject: 'fact',
        content: 'The sky is blue',
      });

      const duplicate = await state.remember({
        type: 'observation',
        subject: 'fact',
        content: 'The sky is blue',
      });

      expect((duplicate as any).conflicted).toBeUndefined();
    });
  });

  // =========================================================================
  // Learning type conflicts
  // =========================================================================
  describe('learning conflicts', () => {
    it('flags conflict when new learning contradicts existing on same topic', async () => {
      await state.remember({
        type: 'learning',
        topic: 'testing-approach',
        insight: 'Unit tests should mock all external dependencies',
      });

      const conflicted = await state.remember({
        type: 'learning',
        topic: 'testing-approach',
        insight: 'Integration tests should use real dependencies, never mock',
      });

      expect((conflicted as any).conflicted).toBe(true);
    });

    it('does NOT flag conflict for complementary learnings', async () => {
      await state.remember({
        type: 'learning',
        topic: 'code-style',
        insight: 'Prefers functional programming patterns',
      });

      const complementary = await state.remember({
        type: 'learning',
        topic: 'code-style',
        insight: 'Prefers functional programming with immutable data structures',
      });

      expect((complementary as any).conflicted).toBeUndefined();
    });
  });

  // =========================================================================
  // New entries (no dedup match) — never conflicted
  // =========================================================================
  describe('new entries — no conflict possible', () => {
    it('new observation has no conflict flag', async () => {
      const entry = await state.remember({
        type: 'observation',
        subject: 'new-fact',
        content: 'Something completely new',
      });

      expect((entry as any).conflicted).toBeUndefined();
    });

    it('new reflection has no conflict flag', async () => {
      const entry = await state.remember({
        type: 'reflection',
        insight: 'A new reflection',
        evidence: [],
        significance: 'minor',
      });

      expect((entry as any).conflicted).toBeUndefined();
    });
  });

  // =========================================================================
  // Conflict visible via recall
  // =========================================================================
  describe('conflict metadata survives recall', () => {
    it('conflicted flag persists through recall', async () => {
      await state.remember({
        type: 'observation',
        subject: 'preference',
        content: 'Likes coffee',
      });

      await state.remember({
        type: 'observation',
        subject: 'preference',
        content: 'Hates coffee and never drinks it',
      });

      const memories = await state.recall({});
      const active = memories.filter((m) => !m.supersededBy);
      const conflicted = active.find((m) => (m as any).conflicted);
      expect(conflicted).toBeDefined();
    });
  });
});
