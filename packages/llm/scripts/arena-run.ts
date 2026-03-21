#!/usr/bin/env tsx
/**
 * Arena experiment runner.
 *
 * Usage:
 *   npm run arena:run                          — full experiment (30 trials/path)
 *   npm run arena:run -- --pilot               — pilot run (5 trials/path)
 *   npm run arena:run -- --trials 10           — custom trial count
 *   npm run arena:run -- --paths path-1,path-2 — subset of paths
 *   npm run arena:run -- --encounters e1,e2    — subset of encounters
 *   npm run arena:run -- --no-preregister      — skip pre-registration
 *
 * Requires ANTHROPIC_API_KEY (reads from env or packages/web/.env.local).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runExperiment } from '../src/arena/experiment-runner';
import { createArenaTraceWriter } from '../src/arena/trace-writer';
import { freezeExperimentConfig } from '../src/arena/preregister';
import { formatExperimentReport } from '../src/arena/viz';
import { ENCOUNTERS, PATHS } from '../src/arena/encounters';
import { ARENA_TOOL_CONFIGS } from '../src/arena/tool-packages';
import { createLiveAgentFn, createLiveLlmFn } from '../src/arena/live-agent';

// ---------------------------------------------------------------------------
// Load API key
// ---------------------------------------------------------------------------

if (!process.env.ANTHROPIC_API_KEY) {
  const envPath = path.resolve(import.meta.dirname, '../../web/.env.local');
  try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key === 'ANTHROPIC_API_KEY') {
        process.env.ANTHROPIC_API_KEY = value;
      }
    }
  } catch {
    // ignore
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY not found.');
  console.error('Set it in env or in packages/web/.env.local');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const flagValue = (name: string): string | undefined => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
};

const isPilot = flag('pilot');
const trialsPerPath = parseInt(flagValue('trials') ?? (isPilot ? '5' : '30'), 10);
const baselineTrials = trialsPerPath;
const maxSteps = parseInt(flagValue('max-steps') ?? '15', 10);
const skipPreregister = flag('no-preregister');

const pathFilter = flagValue('paths')?.split(',');
const encounterFilter = flagValue('encounters')?.split(',');

const selectedPaths = pathFilter
  ? PATHS.filter(p => pathFilter.includes(p.id))
  : PATHS;

const selectedEncounters = encounterFilter
  ? ENCOUNTERS.filter(e => encounterFilter.includes(e.id))
  : ENCOUNTERS;

if (selectedPaths.length === 0) {
  console.error(`Error: no paths matched filter "${pathFilter?.join(',')}"`);
  process.exit(1);
}
if (selectedEncounters.length === 0) {
  console.error(`Error: no encounters matched filter "${encounterFilter?.join(',')}"`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const DATA_DIR = path.resolve(import.meta.dirname, '../data/arena');
const REG_DIR = path.join(DATA_DIR, 'registrations');
const SOUL_PATH = path.resolve(import.meta.dirname, '../src/amygdala/SOUL.md');

async function main() {
  const totalRuns = selectedPaths.length * trialsPerPath + baselineTrials;
  const mode = isPilot ? 'PILOT' : 'FULL';

  console.log(`\n🏟️  Arena ${mode} — ${totalRuns} runs`);
  console.log(`   Paths: ${selectedPaths.map(p => p.id).join(', ')}`);
  console.log(`   Encounters: ${selectedEncounters.map(e => e.id).join(', ')}`);
  console.log(`   Trials/path: ${trialsPerPath}, Baseline: ${baselineTrials}`);
  console.log(`   Max steps/encounter: ${maxSteps}`);
  console.log('');

  // Pre-register
  let experimentId: string;

  if (!skipPreregister) {
    const soulDoc = fs.readFileSync(SOUL_PATH, 'utf-8');
    const reg = freezeExperimentConfig({
      encounters: selectedEncounters,
      paths: selectedPaths,
      toolConfigs: ARENA_TOOL_CONFIGS,
      soulDoc,
      temperature: 0.7,
      trialsPerPath,
      baselineTrials,
      maxStepsPerEncounter: maxSteps,
      outputDir: REG_DIR,
    });
    experimentId = reg.experimentId;
    console.log(`   Pre-registered: ${experimentId}`);
    console.log(`   Config hash: ${reg.hash.slice(0, 16)}...`);
  } else {
    experimentId = `arena-${Date.now().toString(36)}`;
    console.log(`   Experiment ID: ${experimentId} (no pre-registration)`);
  }

  console.log('');

  // Create agent and LLM functions
  const agentFn = createLiveAgentFn();
  const llmFn = createLiveLlmFn();
  const writer = createArenaTraceWriter({ basePath: DATA_DIR });

  // Import what we need for per-run execution
  const { createArenaRun } = await import('../src/arena/arena-run');
  const { BASELINE_PATH } = await import('../src/arena/encounters');
  const { default: { computeSummary } } = { default: { computeSummary: null } }; // we'll compute summary ourselves

  // Build run queue: paths × trials + baseline
  type RunSpec = { path: typeof selectedPaths[0]; runId: string; baselineTools?: string[] };
  const queue: RunSpec[] = [];
  let counter = 0;

  for (const p of selectedPaths) {
    for (let t = 0; t < trialsPerPath; t++) {
      counter++;
      queue.push({ path: p, runId: `${p.id}-trial-${t + 1}-${counter}` });
    }
  }
  for (let t = 0; t < baselineTrials; t++) {
    counter++;
    queue.push({
      path: BASELINE_PATH,
      runId: `baseline-trial-${t + 1}-${counter}`,
      baselineTools: ['inspect', 'act'],
    });
  }

  // Execute per-run with progress and error resilience
  const startTime = Date.now();
  const traces: import('../src/arena/types').RunTrace[] = [];
  let errors = 0;

  for (let i = 0; i < queue.length; i++) {
    const spec = queue[i];
    const runNum = `[${i + 1}/${totalRuns}]`;

    try {
      process.stdout.write(`\r   ${runNum} ${spec.runId.slice(0, 35).padEnd(35)} running...`);

      // Stream events to disk as they happen
      const sink = writer.createEventSink(experimentId, spec.runId);

      const trace = await createArenaRun({
        encounters: selectedEncounters,
        path: spec.path,
        agentFn,
        llmFn,
        maxSteps,
        runId: spec.runId,
        onEvent: sink,
        ...(spec.baselineTools ? { baselineTools: spec.baselineTools as any } : {}),
      });

      traces.push(trace);

      const status = trace.death.dead ? `✗ ${trace.death.cause}` : '✓';
      process.stdout.write(`\r   ${runNum} ${spec.runId.slice(0, 35).padEnd(35)} ${status.padEnd(15)} ${trace.steps.length} steps\n`);
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`\r   ${runNum} ${spec.runId.slice(0, 35).padEnd(35)} ERROR: ${msg.slice(0, 50)}\n`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n   Completed ${traces.length}/${totalRuns} runs in ${elapsed}s${errors > 0 ? ` (${errors} errors)` : ''}\n`);

  // Print report
  if (traces.length > 0) {
    console.log(formatExperimentReport(traces));
  }

  console.log(`\nTraces written to: ${path.join(DATA_DIR, experimentId)}/`);
  console.log(`View with: npm run arena:viz ${experimentId}`);
}

main().catch(err => {
  console.error('\nExperiment failed:', err.message);
  process.exit(1);
});
