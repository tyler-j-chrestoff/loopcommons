import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  freezeExperimentConfig,
  type ExperimentFreeze,
  loadExperimentFreeze,
} from '../../src/arena/preregister';
import { ENCOUNTERS, PATHS } from '../../src/arena/encounters';
import { ARENA_TOOL_CONFIGS } from '../../src/arena/tool-packages';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('preregister', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-prereg-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('freezeExperimentConfig', () => {
    it('produces a content hash of the config', () => {
      const result = freezeExperimentConfig({
        encounters: ENCOUNTERS,
        paths: PATHS,
        toolConfigs: ARENA_TOOL_CONFIGS,
        soulDoc: 'test soul doc',
        temperature: 0.7,
        trialsPerPath: 30,
        baselineTrials: 30,
        maxStepsPerEncounter: 20,
        outputDir: tmpDir,
      });

      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.experimentId).toContain(result.hash.slice(0, 12));
    });

    it('writes a JSON file to the output directory', () => {
      const result = freezeExperimentConfig({
        encounters: ENCOUNTERS,
        paths: PATHS,
        toolConfigs: ARENA_TOOL_CONFIGS,
        soulDoc: 'test soul doc',
        temperature: 0.7,
        trialsPerPath: 30,
        baselineTrials: 30,
        maxStepsPerEncounter: 20,
        outputDir: tmpDir,
      });

      const filePath = path.join(tmpDir, `${result.experimentId}.json`);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('same config produces same hash', () => {
      const opts = {
        encounters: ENCOUNTERS,
        paths: PATHS,
        toolConfigs: ARENA_TOOL_CONFIGS,
        soulDoc: 'same soul',
        temperature: 0.7,
        trialsPerPath: 30,
        baselineTrials: 30,
        maxStepsPerEncounter: 20,
        outputDir: tmpDir,
      };

      const r1 = freezeExperimentConfig(opts);
      const r2 = freezeExperimentConfig(opts);
      expect(r1.hash).toBe(r2.hash);
    });

    it('different config produces different hash', () => {
      const base = {
        encounters: ENCOUNTERS,
        paths: PATHS,
        toolConfigs: ARENA_TOOL_CONFIGS,
        soulDoc: 'soul v1',
        temperature: 0.7,
        trialsPerPath: 30,
        baselineTrials: 30,
        maxStepsPerEncounter: 20,
        outputDir: tmpDir,
      };

      const r1 = freezeExperimentConfig(base);
      const r2 = freezeExperimentConfig({ ...base, temperature: 0.9 });
      expect(r1.hash).not.toBe(r2.hash);
    });

    it('changing soul doc changes hash', () => {
      const base = {
        encounters: ENCOUNTERS,
        paths: PATHS,
        toolConfigs: ARENA_TOOL_CONFIGS,
        soulDoc: 'soul v1',
        temperature: 0.7,
        trialsPerPath: 30,
        baselineTrials: 30,
        maxStepsPerEncounter: 20,
        outputDir: tmpDir,
      };

      const r1 = freezeExperimentConfig(base);
      const r2 = freezeExperimentConfig({ ...base, soulDoc: 'soul v2' });
      expect(r1.hash).not.toBe(r2.hash);
    });

    it('freeze contains all config fields', () => {
      const result = freezeExperimentConfig({
        encounters: ENCOUNTERS,
        paths: PATHS,
        toolConfigs: ARENA_TOOL_CONFIGS,
        soulDoc: 'soul',
        temperature: 0.7,
        trialsPerPath: 30,
        baselineTrials: 30,
        maxStepsPerEncounter: 20,
        outputDir: tmpDir,
      });

      expect(result.freeze.temperature).toBe(0.7);
      expect(result.freeze.trialsPerPath).toBe(30);
      expect(result.freeze.baselineTrials).toBe(30);
      expect(result.freeze.maxStepsPerEncounter).toBe(20);
      expect(result.freeze.encounterIds).toEqual(ENCOUNTERS.map(e => e.id));
      expect(result.freeze.pathIds).toEqual(PATHS.map(p => p.id));
      expect(result.freeze.soulDocHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.freeze.frozenAt).toBeDefined();
    });
  });

  describe('loadExperimentFreeze', () => {
    it('loads a previously frozen config', () => {
      const result = freezeExperimentConfig({
        encounters: ENCOUNTERS,
        paths: PATHS,
        toolConfigs: ARENA_TOOL_CONFIGS,
        soulDoc: 'soul',
        temperature: 0.7,
        trialsPerPath: 30,
        baselineTrials: 30,
        maxStepsPerEncounter: 20,
        outputDir: tmpDir,
      });

      const loaded = loadExperimentFreeze(tmpDir, result.experimentId);
      expect(loaded).not.toBeNull();
      expect(loaded!.hash).toBe(result.hash);
      expect(loaded!.freeze.temperature).toBe(0.7);
    });

    it('returns null for non-existent experiment', () => {
      const loaded = loadExperimentFreeze(tmpDir, 'nope');
      expect(loaded).toBeNull();
    });

    it('verifies hash integrity on load', () => {
      const result = freezeExperimentConfig({
        encounters: ENCOUNTERS,
        paths: PATHS,
        toolConfigs: ARENA_TOOL_CONFIGS,
        soulDoc: 'soul',
        temperature: 0.7,
        trialsPerPath: 30,
        baselineTrials: 30,
        maxStepsPerEncounter: 20,
        outputDir: tmpDir,
      });

      // Tamper with the file
      const filePath = path.join(tmpDir, `${result.experimentId}.json`);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      data.freeze.temperature = 999;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

      expect(() => loadExperimentFreeze(tmpDir, result.experimentId)).toThrow(/integrity/i);
    });
  });
});
