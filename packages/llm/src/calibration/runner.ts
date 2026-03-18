/**
 * Calibration runner — the core propose/test/evaluate/keep-revert loop.
 *
 * cal-06 + cal-08: Runner loop with stopping criteria.
 *
 * Reads the amygdala system prompt, proposes edits via the proposer LLM,
 * runs the test battery, evaluates fitness, and keeps or reverts each edit.
 * Logs every iteration to JSONL and updates calibration memory.
 */

import * as fs from 'node:fs';
import { computeFitness, type FitnessMetrics, type TestResult } from './fitness';
import { createCalibrationLogger, type CalibrationLogEntry } from './logger';
import { createCalibrationMemory } from './memory';
import type { Proposer, ProposedEdit } from './proposer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestRunResult {
  results: TestResult[];
  totalCost: number;
}

export interface RunnerConfig {
  /** Path to the amygdala TypeScript file containing SYSTEM_PROMPT. */
  promptPath: string;
  /** Path to the JSONL log file. */
  logPath: string;
  /** Path to the calibration memory JSON file. */
  memoryPath: string;
  /** Maximum total iterations. Default: 50. */
  maxIterations: number;
  /** Stop after this many consecutive no-improvement iterations. Default: 5. */
  maxNoImprovement: number;
  /** Whether to use git operations for checkpointing. */
  useGit: boolean;
  /** The proposer instance (or mock for testing). */
  proposer: Proposer;
  /** Function that runs the test battery and returns results. */
  testRunner: (promptPath: string) => Promise<TestRunResult>;
}

export interface RunnerResult {
  iterations: number;
  kept: number;
  reverted: number;
  baselineFitness: number;
  finalFitness: number;
  stoppedReason: 'max-iterations' | 'no-improvement';
}

// ---------------------------------------------------------------------------
// Prompt file I/O
// ---------------------------------------------------------------------------

const PROMPT_REGEX = /const SYSTEM_PROMPT = `([\s\S]*?)`;/;

export function readPromptFromFile(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(PROMPT_REGEX);
  if (!match) {
    throw new Error('Could not find SYSTEM_PROMPT in file');
  }
  return match[1];
}

export function writePromptToFile(filePath: string, prompt: string): void {
  const content = fs.readFileSync(filePath, 'utf-8');
  const newContent = content.replace(PROMPT_REGEX, `const SYSTEM_PROMPT = \`${prompt}\`;`);
  fs.writeFileSync(filePath, newContent);
}

// ---------------------------------------------------------------------------
// Edit application
// ---------------------------------------------------------------------------

export function applyEdit(prompt: string, edit: ProposedEdit): string {
  switch (edit.editType) {
    case 'replace': {
      if (!prompt.includes(edit.search)) {
        throw new Error(`Search text not found in prompt: "${edit.search.slice(0, 80)}..."`);
      }
      return prompt.replace(edit.search, edit.replacement);
    }
    case 'append': {
      return prompt + edit.replacement;
    }
    case 'remove': {
      if (!prompt.includes(edit.search)) {
        throw new Error(`Search text not found in prompt: "${edit.search.slice(0, 80)}..."`);
      }
      return prompt.replace(edit.search, '');
    }
  }
}

// ---------------------------------------------------------------------------
// Token count approximation
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  // Rough approximation: ~4 chars per token for English text
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runCalibration(config: RunnerConfig): Promise<RunnerResult> {
  const logger = createCalibrationLogger(config.logPath);
  const memory = createCalibrationMemory(config.memoryPath);

  // Read initial prompt
  let currentPrompt = readPromptFromFile(config.promptPath);
  const baselinePromptTokens = estimateTokens(currentPrompt);

  // Run baseline tests
  const baselineRun = await config.testRunner(config.promptPath);
  const baselineMeanCost = baselineRun.totalCost / Math.max(baselineRun.results.length, 1);
  const baselineResult = computeFitness(
    baselineRun.results,
    baselinePromptTokens,
    // For baseline, use itself as reference (all metrics = 1.0 equivalent)
    { detectionRate: 0, fpRate: 1, simplicity: 0, costEfficiency: 0 },
    baselinePromptTokens,
    baselineMeanCost,
  );

  const baselineMetrics: FitnessMetrics = baselineResult.metrics;
  const baselineFitness = baselineResult.fitnessScore;

  // Log baseline
  logger.append({
    iteration: 0,
    timestamp: new Date().toISOString(),
    proposedEdit: null,
    diff: null,
    metricsBefore: null,
    metricsAfter: baselineMetrics,
    fitnessScore: baselineFitness,
    decision: 'baseline',
    commitHash: null,
    validationMetrics: null,
  });

  let bestFitness = baselineFitness;
  let bestMetrics = baselineMetrics;
  let consecutiveNoImprovement = 0;
  let totalKept = 0;
  let totalReverted = 0;
  let iterationsRun = 0;
  let stoppedReason: 'max-iterations' | 'no-improvement' = 'max-iterations';

  // Collect recent edits for proposer context
  const recentEdits: Array<{
    description: string;
    decision: 'kept' | 'reverted';
    rationale: string;
  }> = [];

  for (let i = 1; i <= config.maxIterations; i++) {
    iterationsRun = i;

    // Check stopping criteria: consecutive no-improvement
    if (consecutiveNoImprovement >= config.maxNoImprovement) {
      stoppedReason = 'no-improvement';
      iterationsRun = i - 1;
      break;
    }

    // Recall memories for proposer
    const memories = memory.recall({ minConfidence: 0.6 }).slice(0, 5);
    const memoryContext = memories.map((m) => {
      if (m.type === 'observation') return { type: m.type, content: `${m.subject}: ${m.pattern}` };
      if (m.type === 'learning') return { type: m.type, content: `${m.topic}: ${m.lesson}` };
      if (m.type === 'reflection') return { type: m.type, content: m.comparison };
      return { type: m.type, content: m.description };
    });

    // Propose edit
    let edit: ProposedEdit;
    try {
      edit = await config.proposer.propose({
        currentPrompt,
        metrics: bestMetrics,
        recentEdits: recentEdits.slice(-3),
        memories: memoryContext,
      });
    } catch (err) {
      // Proposer failed — count as no-improvement, continue
      consecutiveNoImprovement++;
      totalReverted++;
      logger.append({
        iteration: i,
        timestamp: new Date().toISOString(),
        proposedEdit: `[ERROR] ${(err as Error).message}`,
        diff: null,
        metricsBefore: bestMetrics,
        metricsAfter: bestMetrics,
        fitnessScore: bestFitness,
        decision: 'reverted',
        commitHash: null,
        validationMetrics: null,
      });
      continue;
    }

    // Apply edit
    let modifiedPrompt: string;
    try {
      modifiedPrompt = applyEdit(currentPrompt, edit);
    } catch (err) {
      // Edit application failed — count as no-improvement
      consecutiveNoImprovement++;
      totalReverted++;
      recentEdits.push({
        description: `${edit.editType}: ${edit.rationale}`,
        decision: 'reverted',
        rationale: `Edit application failed: ${(err as Error).message}`,
      });
      logger.append({
        iteration: i,
        timestamp: new Date().toISOString(),
        proposedEdit: `${edit.editType}: ${edit.rationale}`,
        diff: null,
        metricsBefore: bestMetrics,
        metricsAfter: bestMetrics,
        fitnessScore: bestFitness,
        decision: 'reverted',
        commitHash: null,
        validationMetrics: null,
      });
      continue;
    }

    // Write modified prompt to file for testing
    writePromptToFile(config.promptPath, modifiedPrompt);

    // Run tests against modified prompt
    const testRun = await config.testRunner(config.promptPath);
    const meanCost = testRun.totalCost / Math.max(testRun.results.length, 1);
    const promptTokens = estimateTokens(modifiedPrompt);

    const fitnessResult = computeFitness(
      testRun.results,
      promptTokens,
      baselineMetrics,
      baselinePromptTokens,
      baselineMeanCost,
    );

    // Generate diff description
    const diffDesc = `${edit.editType}: "${edit.search.slice(0, 60)}" → "${edit.replacement.slice(0, 60)}"`;

    // Decide: keep or revert
    const improved = fitnessResult.accepted && fitnessResult.fitnessScore > bestFitness;

    if (improved) {
      // Keep the edit
      currentPrompt = modifiedPrompt;
      bestFitness = fitnessResult.fitnessScore;
      bestMetrics = fitnessResult.metrics;
      consecutiveNoImprovement = 0;
      totalKept++;

      recentEdits.push({
        description: `${edit.editType}: ${edit.rationale}`,
        decision: 'kept',
        rationale: edit.rationale,
      });

      // Remember: learning (what worked)
      memory.remember({
        type: 'learning',
        topic: edit.rationale.slice(0, 80),
        lesson: `Edit kept. Fitness: ${bestFitness.toFixed(4)}. ${edit.expectedImpact}`,
        context: diffDesc,
        outcome: 'worked',
        tags: ['kept', edit.editType],
      });

      // Remember: experience
      memory.remember({
        type: 'experience',
        iteration: i,
        description: `Kept ${edit.editType} edit: ${edit.rationale}`,
        valence: 0.5,
        tags: ['kept'],
      });
    } else {
      // Revert: restore the previous prompt
      writePromptToFile(config.promptPath, currentPrompt);
      consecutiveNoImprovement++;
      totalReverted++;

      recentEdits.push({
        description: `${edit.editType}: ${edit.rationale}`,
        decision: 'reverted',
        rationale: fitnessResult.rejectionReason ?? 'No improvement in fitness score',
      });

      // Remember: learning (what broke)
      memory.remember({
        type: 'learning',
        topic: edit.rationale.slice(0, 80),
        lesson: `Edit reverted. Reason: ${fitnessResult.rejectionReason ?? 'no improvement'}`,
        context: diffDesc,
        outcome: 'broke',
        tags: ['reverted', edit.editType],
      });
    }

    // Log iteration
    logger.append({
      iteration: i,
      timestamp: new Date().toISOString(),
      proposedEdit: `${edit.editType}: ${edit.rationale}`,
      diff: diffDesc,
      metricsBefore: improved ? baselineMetrics : bestMetrics,
      metricsAfter: fitnessResult.metrics,
      fitnessScore: fitnessResult.fitnessScore,
      decision: improved ? 'kept' : 'reverted',
      commitHash: null,
      validationMetrics: null,
    });

    // Check for plateau: 5+ consecutive no-improvement → reflection memory
    if (consecutiveNoImprovement >= 5) {
      memory.remember({
        type: 'reflection',
        comparison: `Plateau detected after ${consecutiveNoImprovement} consecutive failures. Best fitness: ${bestFitness.toFixed(4)}`,
        driftDetected: false,
        significance: 'high',
        tags: ['plateau'],
      });
    }
  }

  return {
    iterations: iterationsRun,
    kept: totalKept,
    reverted: totalReverted,
    baselineFitness,
    finalFitness: bestFitness,
    stoppedReason,
  };
}
