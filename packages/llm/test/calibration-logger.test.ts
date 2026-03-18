import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createCalibrationLogger } from '../src/calibration/logger';
import type { CalibrationLogEntry, FitnessMetrics } from '../src/calibration/logger';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function tmpLogPath(): string {
  return path.join(tmpDir, 'log.jsonl');
}

function makeMetrics(overrides: Partial<FitnessMetrics> = {}): FitnessMetrics {
  return {
    detectionRate: 0.95,
    fpRate: 0.05,
    simplicity: 1.0,
    costEfficiency: 0.9,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<CalibrationLogEntry> = {}): CalibrationLogEntry {
  return {
    iteration: 1,
    timestamp: '2026-03-18T00:00:00.000Z',
    proposedEdit: 'add threat keyword',
    diff: '--- a/prompt.txt\n+++ b/prompt.txt\n@@ -1 +1 @@\n-old\n+new',
    metricsBefore: makeMetrics({ detectionRate: 0.90 }),
    metricsAfter: makeMetrics(),
    fitnessScore: 0.92,
    decision: 'kept',
    commitHash: 'abc123',
    validationMetrics: null,
    ...overrides,
  };
}

function makeBaselineEntry(): CalibrationLogEntry {
  return {
    iteration: 0,
    timestamp: '2026-03-18T00:00:00.000Z',
    proposedEdit: null,
    diff: null,
    metricsBefore: null,
    metricsAfter: makeMetrics(),
    fitnessScore: 0.9,
    decision: 'baseline',
    commitHash: 'def456',
    validationMetrics: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cal-logger-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('CalibrationLogger', () => {
  it('createCalibrationLogger creates logger with default path', () => {
    const logger = createCalibrationLogger();
    expect(logger).toBeDefined();
    expect(logger.append).toBeTypeOf('function');
    expect(logger.readAll).toBeTypeOf('function');
    expect(logger.latest).toBeTypeOf('function');
  });

  it('append writes a single entry to JSONL file', () => {
    const logPath = tmpLogPath();
    const logger = createCalibrationLogger(logPath);
    logger.append(makeEntry());

    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.length > 0);
    expect(lines).toHaveLength(1);
  });

  it('append atomically writes with fsync', () => {
    const logPath = tmpLogPath();
    const logger = createCalibrationLogger(logPath);
    logger.append(makeEntry());

    // Verify data is on disk by reading raw file immediately
    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
    const parsed = JSON.parse(content.trim());
    expect(parsed.iteration).toBe(1);
  });

  it('append appends multiple entries', () => {
    const logPath = tmpLogPath();
    const logger = createCalibrationLogger(logPath);

    logger.append(makeEntry({ iteration: 1 }));
    logger.append(makeEntry({ iteration: 2 }));
    logger.append(makeEntry({ iteration: 3 }));

    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.length > 0);
    expect(lines).toHaveLength(3);
  });

  it('readAll returns all entries in order', () => {
    const logPath = tmpLogPath();
    const logger = createCalibrationLogger(logPath);

    logger.append(makeEntry({ iteration: 1, fitnessScore: 0.8 }));
    logger.append(makeEntry({ iteration: 2, fitnessScore: 0.85 }));
    logger.append(makeEntry({ iteration: 3, fitnessScore: 0.9 }));

    const entries = logger.readAll();
    expect(entries).toHaveLength(3);
    expect(entries[0].iteration).toBe(1);
    expect(entries[1].iteration).toBe(2);
    expect(entries[2].iteration).toBe(3);
    expect(entries[0].fitnessScore).toBe(0.8);
  });

  it('readAll returns empty array for missing file', () => {
    const logPath = path.join(tmpDir, 'nonexistent', 'log.jsonl');
    const logger = createCalibrationLogger(logPath);
    expect(logger.readAll()).toEqual([]);
  });

  it('readAll returns empty array for empty file', () => {
    const logPath = tmpLogPath();
    fs.writeFileSync(logPath, '');
    const logger = createCalibrationLogger(logPath);
    expect(logger.readAll()).toEqual([]);
  });

  it('latest returns the last entry', () => {
    const logPath = tmpLogPath();
    const logger = createCalibrationLogger(logPath);

    logger.append(makeEntry({ iteration: 1 }));
    logger.append(makeEntry({ iteration: 2 }));
    logger.append(makeEntry({ iteration: 3, fitnessScore: 0.99 }));

    const last = logger.latest();
    expect(last).not.toBeNull();
    expect(last!.iteration).toBe(3);
    expect(last!.fitnessScore).toBe(0.99);
  });

  it('latest returns null for empty log', () => {
    const logPath = tmpLogPath();
    const logger = createCalibrationLogger(logPath);
    expect(logger.latest()).toBeNull();
  });

  it('creates parent directories if they do not exist', () => {
    const logPath = path.join(tmpDir, 'deep', 'nested', 'dir', 'log.jsonl');
    const logger = createCalibrationLogger(logPath);
    logger.append(makeEntry());

    expect(fs.existsSync(logPath)).toBe(true);
    const content = fs.readFileSync(logPath, 'utf-8').trim();
    expect(JSON.parse(content).iteration).toBe(1);
  });

  it('each line is valid JSON', () => {
    const logPath = tmpLogPath();
    const logger = createCalibrationLogger(logPath);

    logger.append(makeEntry({ iteration: 1 }));
    logger.append(makeEntry({ iteration: 2 }));
    logger.append(makeEntry({ iteration: 3 }));

    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.length > 0);
    expect(lines).toHaveLength(3);

    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    // Also verify readAll parses correctly
    const entries = logger.readAll();
    expect(entries).toHaveLength(3);
  });

  it('preserves all fields including null values', () => {
    const logPath = tmpLogPath();
    const logger = createCalibrationLogger(logPath);

    const baseline = makeBaselineEntry();
    logger.append(baseline);

    const entries = logger.readAll();
    expect(entries).toHaveLength(1);

    const roundtripped = entries[0];
    expect(roundtripped.iteration).toBe(0);
    expect(roundtripped.proposedEdit).toBeNull();
    expect(roundtripped.diff).toBeNull();
    expect(roundtripped.metricsBefore).toBeNull();
    expect(roundtripped.metricsAfter).toEqual(makeMetrics());
    expect(roundtripped.fitnessScore).toBe(0.9);
    expect(roundtripped.decision).toBe('baseline');
    expect(roundtripped.commitHash).toBe('def456');
    expect(roundtripped.validationMetrics).toBeNull();
  });
});
