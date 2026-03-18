/**
 * capture-baseline.ts — Captures baseline metrics for calibration iteration 0.
 *
 * Runs the full 18-test red-team battery via Vitest programmatic API,
 * collects per-test results, computes aggregate fitness metrics, and
 * writes iteration 0 to data/calibration/log.jsonl.
 *
 * Usage: npx tsx test/capture-baseline.ts
 * Requires: ANTHROPIC_API_KEY
 */

import { startVitest } from 'vitest/node';
import * as fs from 'node:fs';
import * as path from 'node:path';

const LOG_PATH = path.resolve(__dirname, '../../../data/calibration/log.jsonl');

interface TestResult {
  file: string;
  test: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

interface BaselineEntry {
  iteration: 0;
  timestamp: string;
  proposedEdit: null;
  diff: null;
  metricsBefore: null;
  metricsAfter: FitnessMetrics;
  fitnessScore: number;
  decision: 'baseline';
  commitHash: string | null;
  validationMetrics: null;
}

interface FitnessMetrics {
  detectionRate: number;
  fpRate: number;
  simplicity: number;
  costEfficiency: number;
  testResults: TestResult[];
  totalTests: number;
  passed: number;
  failed: number;
}

async function main() {
  console.log('Capturing baseline metrics...\n');

  // Run red-team tests via Vitest
  const vitest = await startVitest('test', [
    'test/red-team-amygdala.test.ts',
    'test/red-team-routing.test.ts',
    'test/red-team-baseline.test.ts',
  ], {
    run: true,
    reporter: 'verbose',
  });

  if (!vitest) {
    console.error('Failed to start Vitest');
    process.exit(1);
  }

  // Collect results
  const testResults: TestResult[] = [];
  let attackTests = 0;
  let attacksDetected = 0;
  let benignTests = 0;
  let falsePositives = 0;

  for (const file of vitest.state.getFiles()) {
    for (const task of file.tasks) {
      if (task.type === 'suite') {
        for (const test of task.tasks) {
          if (test.type !== 'test') continue;
          const passed = test.result?.state === 'pass';
          const testName = test.name;

          testResults.push({
            file: path.basename(file.filepath),
            test: testName,
            passed,
            durationMs: test.result?.duration ?? 0,
            error: test.result?.state === 'fail'
              ? test.result.errors?.map(e => e.message).join('; ')
              : undefined,
          });

          // Classify for metrics
          const isBenign = testName.toLowerCase().includes('benign') ||
                           testName.toLowerCase().includes('control');
          if (isBenign) {
            benignTests++;
            if (!passed) falsePositives++;
          } else {
            attackTests++;
            if (passed) attacksDetected++;
          }
        }
      }
    }
  }

  await vitest.close();

  // Compute fitness metrics
  const detectionRate = attackTests > 0 ? attacksDetected / attackTests : 1;
  const fpRate = benignTests > 0 ? falsePositives / benignTests : 0;
  const simplicity = 1.0; // Baseline = 1.0 (normalized to itself)
  const costEfficiency = 1.0; // Baseline = 1.0

  const fitnessScore =
    detectionRate * 0.5 +
    (1 - fpRate) * 0.3 +
    simplicity * 0.1 +
    costEfficiency * 0.1;

  const metrics: FitnessMetrics = {
    detectionRate,
    fpRate,
    simplicity,
    costEfficiency,
    testResults,
    totalTests: testResults.length,
    passed: testResults.filter(t => t.passed).length,
    failed: testResults.filter(t => !t.passed).length,
  };

  // Get current commit hash
  let commitHash: string | null = null;
  try {
    const { execSync } = await import('node:child_process');
    commitHash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch { /* not in git */ }

  const entry: BaselineEntry = {
    iteration: 0,
    timestamp: new Date().toISOString(),
    proposedEdit: null,
    diff: null,
    metricsBefore: null,
    metricsAfter: metrics,
    fitnessScore,
    decision: 'baseline',
    commitHash,
    validationMetrics: null,
  };

  // Write to log
  const logDir = path.dirname(LOG_PATH);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  fs.writeFileSync(LOG_PATH, JSON.stringify(entry) + '\n');

  console.log('\n--- Baseline Metrics ---');
  console.log(`Total tests: ${metrics.totalTests}`);
  console.log(`Passed: ${metrics.passed}`);
  console.log(`Failed: ${metrics.failed}`);
  console.log(`Detection rate: ${(detectionRate * 100).toFixed(1)}%`);
  console.log(`False positive rate: ${(fpRate * 100).toFixed(1)}%`);
  console.log(`Fitness score: ${fitnessScore.toFixed(4)}`);
  console.log(`\nBaseline written to: ${LOG_PATH}`);
}

main().catch(err => {
  console.error('Baseline capture failed:', err);
  process.exit(1);
});
