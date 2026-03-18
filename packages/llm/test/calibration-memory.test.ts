/**
 * calibration-memory.test.ts — Tests for the calibration memory module.
 *
 * RED-GREEN TDD: These tests are written first (RED), then implementation follows (GREEN).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCalibrationMemory } from '../src/calibration/memory';
import type { CalibrationMemory, CalibrationMemoryEntry } from '../src/calibration/memory';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function tmpMemoryPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cal-mem-'));
  return path.join(dir, 'memory.json');
}

describe('CalibrationMemory', () => {
  let memPath: string;
  let mem: CalibrationMemory;

  beforeEach(() => {
    memPath = tmpMemoryPath();
    mem = createCalibrationMemory(memPath);
  });

  afterEach(() => {
    // Clean up temp files
    try {
      const dir = path.dirname(memPath);
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // -----------------------------------------------------------------------
  // 1. Empty store
  // -----------------------------------------------------------------------
  it('createCalibrationMemory creates empty memory store', () => {
    const result = mem.recall();
    expect(result).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // 2. Remember + recall Observation
  // -----------------------------------------------------------------------
  it('remember stores and recalls an Observation', () => {
    const entry = mem.remember({
      type: 'observation',
      subject: 'threat-score',
      pattern: 'scores cluster around 0.3',
      confidence: 0.7,
      tags: ['calibration'],
    });

    expect(entry.id).toBeDefined();
    expect(entry.createdAt).toBeDefined();
    expect(entry.type).toBe('observation');

    const recalled = mem.recall({ type: 'observation' });
    expect(recalled).toHaveLength(1);
    expect(recalled[0].id).toBe(entry.id);
  });

  // -----------------------------------------------------------------------
  // 3. Remember + recall Learning
  // -----------------------------------------------------------------------
  it('remember stores and recalls a Learning', () => {
    const entry = mem.remember({
      type: 'learning',
      topic: 'threshold-tuning',
      lesson: 'Lower threshold increases false positives',
      context: 'iteration 3',
      outcome: 'worked',
      tags: ['tuning'],
    });

    expect(entry.type).toBe('learning');
    const recalled = mem.recall({ type: 'learning' });
    expect(recalled).toHaveLength(1);
    expect(recalled[0]).toMatchObject({ topic: 'threshold-tuning' });
  });

  // -----------------------------------------------------------------------
  // 4. Remember + recall Reflection
  // -----------------------------------------------------------------------
  it('remember stores and recalls a Reflection', () => {
    const entry = mem.remember({
      type: 'reflection',
      comparison: 'Prompt v2 vs v1: fewer false positives',
      driftDetected: false,
      significance: 'medium',
      tags: ['comparison'],
    });

    expect(entry.type).toBe('reflection');
    const recalled = mem.recall({ type: 'reflection' });
    expect(recalled).toHaveLength(1);
    expect(recalled[0]).toMatchObject({ comparison: 'Prompt v2 vs v1: fewer false positives' });
  });

  // -----------------------------------------------------------------------
  // 5. Remember + recall Experience
  // -----------------------------------------------------------------------
  it('remember stores and recalls an Experience', () => {
    const entry = mem.remember({
      type: 'experience',
      iteration: 5,
      description: 'Prompt change improved detection rate',
      valence: 0.8,
      tags: ['iteration', 'success'],
    });

    expect(entry.type).toBe('experience');
    const recalled = mem.recall({ type: 'experience' });
    expect(recalled).toHaveLength(1);
    expect(recalled[0]).toMatchObject({ iteration: 5, valence: 0.8 });
  });

  // -----------------------------------------------------------------------
  // 6. recall filters by type
  // -----------------------------------------------------------------------
  it('recall filters by type', () => {
    mem.remember({
      type: 'observation',
      subject: 'x',
      pattern: 'y',
      confidence: 0.5,
      tags: [],
    });
    mem.remember({
      type: 'learning',
      topic: 'a',
      lesson: 'b',
      context: 'c',
      outcome: 'worked',
      tags: [],
    });
    mem.remember({
      type: 'experience',
      iteration: 1,
      description: 'd',
      valence: 0,
      tags: [],
    });

    expect(mem.recall({ type: 'observation' })).toHaveLength(1);
    expect(mem.recall({ type: 'learning' })).toHaveLength(1);
    expect(mem.recall({ type: 'experience' })).toHaveLength(1);
    expect(mem.recall({ type: 'reflection' })).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 7. recall filters by tag
  // -----------------------------------------------------------------------
  it('recall filters by tag', () => {
    mem.remember({
      type: 'observation',
      subject: 'x',
      pattern: 'y',
      confidence: 0.5,
      tags: ['alpha', 'beta'],
    });
    mem.remember({
      type: 'observation',
      subject: 'z',
      pattern: 'w',
      confidence: 0.6,
      tags: ['gamma'],
    });

    expect(mem.recall({ tag: 'alpha' })).toHaveLength(1);
    expect(mem.recall({ tag: 'gamma' })).toHaveLength(1);
    expect(mem.recall({ tag: 'delta' })).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 8. recall filters by minConfidence (only Observations)
  // -----------------------------------------------------------------------
  it('recall filters by minConfidence for Observations only', () => {
    mem.remember({
      type: 'observation',
      subject: 'low',
      pattern: 'p',
      confidence: 0.3,
      tags: [],
    });
    mem.remember({
      type: 'observation',
      subject: 'high',
      pattern: 'q',
      confidence: 0.9,
      tags: [],
    });
    mem.remember({
      type: 'learning',
      topic: 'no-confidence',
      lesson: 'l',
      context: 'c',
      outcome: 'worked',
      tags: [],
    });

    const result = mem.recall({ minConfidence: 0.5 });
    // Should include the high-confidence observation AND the learning (non-observation always passes)
    expect(result).toHaveLength(2);
    const types = result.map((r) => r.type);
    expect(types).toContain('observation');
    expect(types).toContain('learning');
  });

  // -----------------------------------------------------------------------
  // 9. recall excludes expired memories
  // -----------------------------------------------------------------------
  it('recall excludes expired memories', () => {
    mem.remember({
      type: 'observation',
      subject: 'expired',
      pattern: 'p',
      confidence: 0.5,
      tags: [],
      expiresAt: new Date(Date.now() - 60_000).toISOString(), // 1 minute ago
    });
    mem.remember({
      type: 'observation',
      subject: 'valid',
      pattern: 'q',
      confidence: 0.5,
      tags: [],
    });

    const result = mem.recall();
    expect(result).toHaveLength(1);
    expect((result[0] as any).subject).toBe('valid');
  });

  // -----------------------------------------------------------------------
  // 10. recall combines filters with AND
  // -----------------------------------------------------------------------
  it('recall combines filters with AND', () => {
    mem.remember({
      type: 'observation',
      subject: 'a',
      pattern: 'p',
      confidence: 0.8,
      tags: ['target'],
    });
    mem.remember({
      type: 'learning',
      topic: 'b',
      lesson: 'l',
      context: 'c',
      outcome: 'worked',
      tags: ['target'],
    });
    mem.remember({
      type: 'observation',
      subject: 'c',
      pattern: 'q',
      confidence: 0.8,
      tags: ['other'],
    });

    // type=observation AND tag=target => only 1 result
    const result = mem.recall({ type: 'observation', tag: 'target' });
    expect(result).toHaveLength(1);
    expect((result[0] as any).subject).toBe('a');
  });

  // -----------------------------------------------------------------------
  // 11. remember deduplicates Learning by topic+type
  // -----------------------------------------------------------------------
  it('remember deduplicates Learning by topic+type', () => {
    mem.remember({
      type: 'learning',
      topic: 'threshold',
      lesson: 'original lesson',
      context: 'iteration 1',
      outcome: 'worked',
      tags: [],
    });
    mem.remember({
      type: 'learning',
      topic: 'threshold',
      lesson: 'updated lesson',
      context: 'iteration 2',
      outcome: 'broke',
      tags: [],
    });

    const recalled = mem.recall({ type: 'learning' });
    expect(recalled).toHaveLength(1);
    expect((recalled[0] as any).lesson).toBe('updated lesson');
    expect((recalled[0] as any).outcome).toBe('broke');
  });

  // -----------------------------------------------------------------------
  // 12. remember reinforces Observation confidence
  // -----------------------------------------------------------------------
  it('remember reinforces Observation confidence by 0.1 on duplicate subject+pattern', () => {
    mem.remember({
      type: 'observation',
      subject: 'threat-score',
      pattern: 'clusters low',
      confidence: 0.5,
      tags: [],
    });
    const updated = mem.remember({
      type: 'observation',
      subject: 'threat-score',
      pattern: 'clusters low',
      confidence: 0.5,
      tags: [],
    });

    const recalled = mem.recall({ type: 'observation' });
    expect(recalled).toHaveLength(1);
    expect((recalled[0] as any).confidence).toBeCloseTo(0.6);
    expect(updated.id).toBe(recalled[0].id);
  });

  // -----------------------------------------------------------------------
  // 13. remember caps Observation confidence at 1.0
  // -----------------------------------------------------------------------
  it('remember caps Observation confidence at 1.0', () => {
    mem.remember({
      type: 'observation',
      subject: 's',
      pattern: 'p',
      confidence: 0.95,
      tags: [],
    });
    mem.remember({
      type: 'observation',
      subject: 's',
      pattern: 'p',
      confidence: 0.95,
      tags: [],
    });

    const recalled = mem.recall({ type: 'observation' });
    expect(recalled).toHaveLength(1);
    expect((recalled[0] as any).confidence).toBe(1.0);
  });

  // -----------------------------------------------------------------------
  // 14. clear empties the store
  // -----------------------------------------------------------------------
  it('clear empties the store', () => {
    mem.remember({
      type: 'observation',
      subject: 'x',
      pattern: 'y',
      confidence: 0.5,
      tags: [],
    });
    expect(mem.recall()).toHaveLength(1);

    mem.clear();
    expect(mem.recall()).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 15. persists to disk and reloads
  // -----------------------------------------------------------------------
  it('persists to disk and reloads', () => {
    mem.remember({
      type: 'observation',
      subject: 'persist-test',
      pattern: 'p',
      confidence: 0.7,
      tags: ['disk'],
    });

    // Create a new instance with the same path
    const mem2 = createCalibrationMemory(memPath);
    const recalled = mem2.recall();
    expect(recalled).toHaveLength(1);
    expect((recalled[0] as any).subject).toBe('persist-test');
  });

  // -----------------------------------------------------------------------
  // Sorting: Observations by confidence desc, others by createdAt desc
  // -----------------------------------------------------------------------
  it('recall sorts Observations by confidence descending', () => {
    mem.remember({ type: 'observation', subject: 'low', pattern: 'p', confidence: 0.3, tags: [] });
    mem.remember({ type: 'observation', subject: 'high', pattern: 'q', confidence: 0.9, tags: [] });
    mem.remember({ type: 'observation', subject: 'mid', pattern: 'r', confidence: 0.6, tags: [] });

    const recalled = mem.recall({ type: 'observation' });
    const confidences = recalled.map((r) => (r as any).confidence);
    expect(confidences).toEqual([0.9, 0.6, 0.3]);
  });
});
