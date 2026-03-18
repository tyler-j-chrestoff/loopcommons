/**
 * Calibration JSONL logger — appends iteration records for auto-calibration history.
 *
 * Each call to append() writes one JSON line to the log file with fsync for durability.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FitnessMetrics } from './fitness';

// Re-export for convenience
export type { FitnessMetrics } from './fitness';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalibrationLogEntry {
  iteration: number;
  timestamp: string;
  proposedEdit: string | null;
  diff: string | null;
  metricsBefore: FitnessMetrics | null;
  metricsAfter: FitnessMetrics;
  fitnessScore: number;
  decision: 'baseline' | 'kept' | 'reverted';
  commitHash: string | null;
  validationMetrics: FitnessMetrics | null;
}

// ---------------------------------------------------------------------------
// Logger interface
// ---------------------------------------------------------------------------

export interface CalibrationLogger {
  /** Append a log entry. Atomic write (write + fsync). */
  append(entry: CalibrationLogEntry): void;
  /** Read all entries from the log file. */
  readAll(): CalibrationLogEntry[];
  /** Get the latest entry (or null if log is empty). */
  latest(): CalibrationLogEntry | null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const DEFAULT_LOG_PATH = path.resolve('data/calibration/log.jsonl');

export function createCalibrationLogger(logPath?: string): CalibrationLogger {
  const resolvedPath = logPath ?? DEFAULT_LOG_PATH;

  return {
    append(entry: CalibrationLogEntry): void {
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const line = JSON.stringify(entry) + '\n';
      const fd = fs.openSync(resolvedPath, 'a');
      try {
        fs.writeSync(fd, line);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    },

    readAll(): CalibrationLogEntry[] {
      if (!fs.existsSync(resolvedPath)) {
        return [];
      }

      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.length > 0);
      return lines.map(line => JSON.parse(line) as CalibrationLogEntry);
    },

    latest(): CalibrationLogEntry | null {
      const entries = this.readAll();
      if (entries.length === 0) {
        return null;
      }
      return entries[entries.length - 1];
    },
  };
}
