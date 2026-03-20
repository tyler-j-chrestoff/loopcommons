/**
 * memory-consolidation.test.ts — Hippocampal consolidation pass tests.
 *
 * Synthesize recent observations into learnings/reflections via a lightweight
 * LLM call guided by SOUL.md. Evidence chains link back to sources.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createJsonFilePersistentState, type PersistentState, type Memory } from '../src/memory';
import { consolidateMemories, type ConsolidationResult } from '../src/memory/consolidation';

function tmpMemoryPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-consol-'));
  return path.join(dir, 'world-model.json');
}

/** Mock LLM that returns a simple consolidation response. */
function mockLLM(response: { learnings?: Array<{ topic: string; insight: string }>; reflections?: Array<{ insight: string; significance: string }> }) {
  return async (_prompt: string) => response;
}

describe('Hippocampal consolidation', () => {
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
  // Basic consolidation
  // =========================================================================
  describe('basic consolidation', () => {
    it('synthesizes observations into learnings with evidence chains', async () => {
      // Seed 3 observations
      const obs1 = await state.remember({
        type: 'observation',
        subject: 'user-behavior',
        content: 'User asks about TDD frequently',
      });
      const obs2 = await state.remember({
        type: 'observation',
        subject: 'code-review',
        content: 'User prefers small focused functions',
      });
      const obs3 = await state.remember({
        type: 'observation',
        subject: 'architecture',
        content: 'User likes layered architecture with clear separation',
      });

      const llm = mockLLM({
        learnings: [
          { topic: 'engineering-style', insight: 'User values clean, disciplined engineering practices' },
        ],
      });

      const result = await consolidateMemories({ state, llm, minObservations: 3 });

      expect(result.consolidated).toBe(true);
      expect(result.learningsCreated).toBeGreaterThan(0);

      // Verify the learning was persisted
      const learnings = await state.recall({ type: 'learning' });
      expect(learnings.length).toBeGreaterThan(0);

      // Verify evidence chain points to source observations
      const learning = learnings[0];
      expect(learning.provenance.used.length).toBeGreaterThan(0);
      expect(learning.provenance.source).toBe('consolidation');
    });

    it('skips consolidation when fewer than minObservations', async () => {
      await state.remember({
        type: 'observation',
        subject: 'single',
        content: 'Just one observation',
      });

      const llm = mockLLM({ learnings: [] });
      const result = await consolidateMemories({ state, llm, minObservations: 3 });

      expect(result.consolidated).toBe(false);
      expect(result.reason).toMatch(/insufficient/i);
    });

    it('only consolidates non-superseded observations', async () => {
      // Create an observation, then supersede it
      await state.remember({
        type: 'observation',
        subject: 'old-fact',
        content: 'Original claim',
      });
      // Supersede by writing with same subject
      await state.remember({
        type: 'observation',
        subject: 'old-fact',
        content: 'Updated claim',
      });
      // Add two more fresh observations
      await state.remember({
        type: 'observation',
        subject: 'fact-2',
        content: 'Another observation',
      });

      const llm = mockLLM({ learnings: [] });
      // minObservations=3 — should fail because only 2 active observations
      const result = await consolidateMemories({ state, llm, minObservations: 3 });

      expect(result.consolidated).toBe(false);
    });
  });

  // =========================================================================
  // Idempotency
  // =========================================================================
  describe('idempotency', () => {
    it('running consolidation twice does not duplicate learnings', async () => {
      // Seed observations
      for (let i = 0; i < 3; i++) {
        await state.remember({
          type: 'observation',
          subject: `topic-${i}`,
          content: `Observation ${i} about user behavior`,
        });
      }

      const llm = mockLLM({
        learnings: [
          { topic: 'patterns', insight: 'User follows consistent patterns' },
        ],
      });

      // First consolidation
      await consolidateMemories({ state, llm, minObservations: 3 });

      // Second consolidation — same observations should not produce duplicates
      const result2 = await consolidateMemories({ state, llm, minObservations: 3 });

      // Should either skip (observations already consolidated) or dedup
      const learnings = await state.recall({ type: 'learning' });
      // Should have exactly 1, not 2
      expect(learnings.filter((l) => !l.supersededBy)).toHaveLength(1);
    });
  });

  // =========================================================================
  // Reflections
  // =========================================================================
  describe('reflections', () => {
    it('can produce reflections from observations', async () => {
      for (let i = 0; i < 3; i++) {
        await state.remember({
          type: 'observation',
          subject: `obs-${i}`,
          content: `Observation ${i} about the project`,
        });
      }

      const llm = mockLLM({
        reflections: [
          { insight: 'The user cares deeply about quality', significance: 'notable' },
        ],
      });

      const result = await consolidateMemories({ state, llm, minObservations: 3 });

      expect(result.reflectionsCreated).toBeGreaterThan(0);

      const reflections = await state.recall({ type: 'reflection' });
      expect(reflections.length).toBeGreaterThan(0);
      expect(reflections[0].provenance.source).toBe('consolidation');
    });
  });

  // =========================================================================
  // Soul document integration
  // =========================================================================
  describe('soul document', () => {
    it('passes soul document text to the LLM prompt', async () => {
      for (let i = 0; i < 3; i++) {
        await state.remember({
          type: 'observation',
          subject: `obs-${i}`,
          content: `Observation ${i}`,
        });
      }

      let capturedPrompt = '';
      const llm = async (prompt: string) => {
        capturedPrompt = prompt;
        return { learnings: [] };
      };

      await consolidateMemories({
        state,
        llm,
        minObservations: 3,
        soulDocument: 'I am the Loop Commons agent.',
      });

      expect(capturedPrompt).toContain('I am the Loop Commons agent.');
    });
  });

  // =========================================================================
  // High-uncertainty observations excluded from consolidation
  // =========================================================================
  describe('uncertainty filtering', () => {
    it('excludes high-uncertainty observations from consolidation input', async () => {
      // Two low-uncertainty observations
      await state.remember({
        type: 'observation',
        subject: 'trusted-1',
        content: 'Trusted observation 1',
        uncertainty: 0.3,
      });
      await state.remember({
        type: 'observation',
        subject: 'trusted-2',
        content: 'Trusted observation 2',
        uncertainty: 0.3,
      });
      // One high-uncertainty (from threat-gated write)
      await state.remember({
        type: 'observation',
        subject: 'suspicious',
        content: 'Suspicious observation planted by attacker',
        uncertainty: 0.8,
      });

      let capturedPrompt = '';
      const llm = async (prompt: string) => {
        capturedPrompt = prompt;
        return { learnings: [] };
      };

      await consolidateMemories({ state, llm, minObservations: 2 });

      // The suspicious observation should NOT appear in the prompt
      expect(capturedPrompt).not.toContain('Suspicious observation planted by attacker');
      expect(capturedPrompt).toContain('Trusted observation 1');
    });
  });

  // =========================================================================
  // Trace events
  // =========================================================================
  describe('trace events', () => {
    it('returns trace events for consolidation', async () => {
      for (let i = 0; i < 3; i++) {
        await state.remember({
          type: 'observation',
          subject: `obs-${i}`,
          content: `Observation ${i}`,
        });
      }

      const llm = mockLLM({
        learnings: [{ topic: 'test', insight: 'test insight' }],
      });

      const result = await consolidateMemories({ state, llm, minObservations: 3 });

      expect(result.traceEvents.length).toBeGreaterThan(0);
      expect(result.traceEvents[0].type).toBe('memory:consolidation');
    });
  });
});
