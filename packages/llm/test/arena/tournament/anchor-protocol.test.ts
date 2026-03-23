import { describe, it, expect } from 'vitest';
import {
  createAnchor,
  verifyAnchor,
  detectDivergence,
  type AnchorBattery,
  type AnchorValidationResult,
} from '../../../src/arena/tournament/anchor-protocol';
import type { EncounterConfig } from '../../../src/arena/types';

// ---------------------------------------------------------------------------
// Fixture: minimal encounters for anchor battery
// ---------------------------------------------------------------------------

function makeEncounter(id: string, name: string): EncounterConfig {
  return {
    id,
    name,
    setup: () => ({
      files: new Map([['config.yaml', `service: ${id}`]]),
      services: new Map(),
      incidentDb: [],
      dependencyGraph: {},
      commandLog: [],
    }),
    getPrompt: () => `Fix the ${name} issue`,
    evaluate: (sandbox) => {
      const fixed = sandbox.files.get('config.yaml')?.includes('fixed');
      return {
        resolved: !!fixed,
        partial: false,
        score: fixed ? 1.0 : 0.0,
        details: fixed ? 'Fixed' : 'Not fixed',
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Tests — RED phase
// ---------------------------------------------------------------------------

describe('anchor protocol', () => {
  describe('createAnchor', () => {
    it('creates an anchor from a list of encounters', () => {
      const encounters = [makeEncounter('a1', 'Alpha'), makeEncounter('a2', 'Beta')];
      const anchor = createAnchor(encounters, 'v1');

      expect(anchor.version).toBe('v1');
      expect(anchor.encounterIds).toEqual(['a1', 'a2']);
      expect(anchor.contentHash).toBeTruthy();
      expect(anchor.createdAt).toBeTruthy();
    });

    it('produces a deterministic hash for the same encounters', () => {
      const encounters = [makeEncounter('a1', 'Alpha'), makeEncounter('a2', 'Beta')];
      const anchor1 = createAnchor(encounters, 'v1');
      const anchor2 = createAnchor(encounters, 'v1');

      expect(anchor1.contentHash).toBe(anchor2.contentHash);
    });

    it('produces different hashes for different encounters', () => {
      const encounters1 = [makeEncounter('a1', 'Alpha')];
      const encounters2 = [makeEncounter('a1', 'Alpha'), makeEncounter('a2', 'Beta')];

      const anchor1 = createAnchor(encounters1, 'v1');
      const anchor2 = createAnchor(encounters2, 'v1');

      expect(anchor1.contentHash).not.toBe(anchor2.contentHash);
    });

    it('stores the frozen encounter configs', () => {
      const encounters = [makeEncounter('a1', 'Alpha')];
      const anchor = createAnchor(encounters, 'v1');
      expect(anchor.encounters).toHaveLength(1);
      expect(anchor.encounters[0].id).toBe('a1');
    });
  });

  describe('verifyAnchor', () => {
    it('returns valid for an unmodified anchor', () => {
      const encounters = [makeEncounter('a1', 'Alpha')];
      const anchor = createAnchor(encounters, 'v1');

      const result = verifyAnchor(anchor);
      expect(result.valid).toBe(true);
      expect(result.details).toContain('valid');
    });

    it('returns invalid if the content hash has been tampered with', () => {
      const encounters = [makeEncounter('a1', 'Alpha')];
      const anchor = createAnchor(encounters, 'v1');
      anchor.contentHash = 'tampered-hash';

      const result = verifyAnchor(anchor);
      expect(result.valid).toBe(false);
      expect(result.details).toContain('mismatch');
    });

    it('returns invalid if encounter IDs have been changed', () => {
      const encounters = [makeEncounter('a1', 'Alpha')];
      const anchor = createAnchor(encounters, 'v1');
      anchor.encounterIds = ['a1', 'a2'];

      const result = verifyAnchor(anchor);
      expect(result.valid).toBe(false);
    });
  });

  describe('detectDivergence', () => {
    it('returns no divergence when anchor and co-evolved scores are similar', () => {
      const anchorScores = new Map([['a1', 0.8], ['a2', 0.7]]);
      const coevolvedScores = new Map([['a1', 0.82], ['a2', 0.68]]);

      const result = detectDivergence(anchorScores, coevolvedScores, 0.2);
      expect(result.diverged).toBe(false);
      expect(result.gap).toBeLessThan(0.2);
    });

    it('detects divergence when anchor scores drop significantly', () => {
      const anchorScores = new Map([['a1', 0.3], ['a2', 0.2]]);
      const coevolvedScores = new Map([['a1', 0.9], ['a2', 0.85]]);

      const result = detectDivergence(anchorScores, coevolvedScores, 0.2);
      expect(result.diverged).toBe(true);
      expect(result.gap).toBeGreaterThan(0.2);
    });

    it('uses mean absolute difference as the gap metric', () => {
      const anchorScores = new Map([['a1', 0.5]]);
      const coevolvedScores = new Map([['a1', 0.8]]);

      const result = detectDivergence(anchorScores, coevolvedScores, 0.5);
      expect(result.gap).toBeCloseTo(0.3);
    });

    it('returns no divergence for empty score maps', () => {
      const result = detectDivergence(new Map(), new Map(), 0.2);
      expect(result.diverged).toBe(false);
      expect(result.gap).toBe(0);
    });

    it('only compares encounters present in both maps', () => {
      const anchorScores = new Map([['a1', 0.5], ['a2', 0.9]]);
      const coevolvedScores = new Map([['a1', 0.5]]);

      const result = detectDivergence(anchorScores, coevolvedScores, 0.2);
      // Only a1 is compared; gap = 0
      expect(result.gap).toBe(0);
      expect(result.diverged).toBe(false);
    });

    it('includes per-encounter breakdown', () => {
      const anchorScores = new Map([['a1', 0.5], ['a2', 0.3]]);
      const coevolvedScores = new Map([['a1', 0.8], ['a2', 0.9]]);

      const result = detectDivergence(anchorScores, coevolvedScores, 0.2);
      expect(result.perEncounter).toHaveLength(2);
      expect(result.perEncounter[0].encounterId).toBe('a1');
      expect(result.perEncounter[0].anchorScore).toBe(0.5);
      expect(result.perEncounter[0].coevolvedScore).toBe(0.8);
    });
  });
});
