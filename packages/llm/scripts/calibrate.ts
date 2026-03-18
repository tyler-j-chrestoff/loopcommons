#!/usr/bin/env tsx
/**
 * calibrate.ts — CLI entry point for the auto-calibration runner.
 *
 * Usage: npm run calibrate [-- --max-iterations N] [-- --max-no-improvement N]
 * Requires: ANTHROPIC_API_KEY
 */

import * as path from 'node:path';
import { startVitest } from 'vitest/node';
import { runCalibration, type TestRunResult } from '../src/calibration/runner';
import { createProposer } from '../src/calibration/proposer';
import type { TestResult } from '../src/calibration/fitness';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LLM_ROOT = path.resolve(import.meta.dirname, '..');
const PROMPT_PATH = path.join(LLM_ROOT, 'src/amygdala/index.ts');
const LOG_PATH = path.resolve(LLM_ROOT, '../../data/calibration/log.jsonl');
const MEMORY_PATH = path.resolve(LLM_ROOT, '../../data/calibration/memory.json');

// Optimization test files (from calibration-split.json)
const OPTIMIZATION_TESTS = [
  'test/red-team-amygdala.test.ts',
  'test/red-team-routing.test.ts',
  'test/red-team-baseline.test.ts',
];

// Parse CLI args
const args = process.argv.slice(2);
const maxIterations = parseInt(args[args.indexOf('--max-iterations') + 1]) || 50;
const maxNoImprovement = parseInt(args[args.indexOf('--max-no-improvement') + 1]) || 5;

// ---------------------------------------------------------------------------
// Test runner using Vitest programmatic API
// ---------------------------------------------------------------------------

async function vitestTestRunner(_promptPath: string): Promise<TestRunResult> {
  const vitest = await startVitest('test', OPTIMIZATION_TESTS, {
    run: true,
    reporter: 'verbose',
  });

  if (!vitest) {
    throw new Error('Failed to start Vitest');
  }

  const results: TestResult[] = [];
  let totalCost = 0;

  for (const file of vitest.state.getFiles()) {
    for (const task of file.tasks) {
      if (task.type === 'suite') {
        for (const test of task.tasks) {
          if (test.type !== 'test') continue;
          const passed = test.result?.state === 'pass';
          const testName = test.name;

          const isBenign =
            testName.toLowerCase().includes('benign') ||
            testName.toLowerCase().includes('control');

          results.push({
            name: testName,
            passed,
            isBenign,
            durationMs: test.result?.duration ?? 0,
          });
        }
      }
    }
  }

  await vitest.close();

  return { results, totalCost };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is required');
    process.exit(1);
  }

  console.log('=== Amygdala Auto-Calibration ===');
  console.log(`Max iterations: ${maxIterations}`);
  console.log(`Max no-improvement: ${maxNoImprovement}`);
  console.log(`Prompt: ${PROMPT_PATH}`);
  console.log(`Log: ${LOG_PATH}`);
  console.log('');

  const proposer = createProposer();

  const result = await runCalibration({
    promptPath: PROMPT_PATH,
    logPath: LOG_PATH,
    memoryPath: MEMORY_PATH,
    maxIterations,
    maxNoImprovement,
    useGit: true,
    proposer,
    testRunner: vitestTestRunner,
  });

  console.log('\n=== Calibration Complete ===');
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Kept: ${result.kept}`);
  console.log(`Reverted: ${result.reverted}`);
  console.log(`Baseline fitness: ${result.baselineFitness.toFixed(4)}`);
  console.log(`Final fitness: ${result.finalFitness.toFixed(4)}`);
  console.log(`Stopped: ${result.stoppedReason}`);
  console.log(
    `Improvement: ${((result.finalFitness - result.baselineFitness) * 100).toFixed(2)}%`,
  );
}

main().catch((err) => {
  console.error('Calibration failed:', err);
  process.exit(1);
});
