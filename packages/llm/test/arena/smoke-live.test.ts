/**
 * Live smoke test: single run through E1+E2 with real Anthropic API calls.
 *
 * Validates the full pipeline with a real LLM making decisions.
 * Gated by ARENA_LIVE=true + ANTHROPIC_API_KEY.
 *
 * Run: ARENA_LIVE=true npx vitest run test/arena/smoke-live.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createArenaRun } from '../../src/arena/arena-run';
import { createArenaTraceWriter } from '../../src/arena/trace-writer';
import { extractRunRecord, extractChoicePointRecords } from '../../src/arena/trace-schema';
import { ENCOUNTERS, PATHS } from '../../src/arena/encounters';
import { createLiveAgentFn, createLiveLlmFn } from '../../src/arena/live-agent';

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

if (!process.env.ANTHROPIC_API_KEY) {
  const envPath = path.resolve(__dirname, '../../../web/.env.local');
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
    // no .env.local — test will skip
  }
}

const isLive = process.env.ARENA_LIVE === 'true' && !!process.env.ANTHROPIC_API_KEY;
const describeLive = isLive ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describeLive('arena live smoke', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-live-'));
  });

  it('completes a single run through path-1 (E1 + E2 only)', async () => {
    const agentFn = createLiveAgentFn();
    const llmFn = createLiveLlmFn();

    const trace = await createArenaRun({
      encounters: ENCOUNTERS.slice(0, 2),
      path: PATHS[0],
      agentFn,
      llmFn,
      maxSteps: 15,
      runId: 'live-smoke-1',
    });

    console.log('\n--- Live Smoke Results ---');
    console.log(`Run ID: ${trace.runId}`);
    console.log(`Path: ${trace.pathId}`);
    console.log(`Dead: ${trace.death.dead}${trace.death.cause ? ` (${trace.death.cause})` : ''}`);
    console.log(`Steps: ${trace.steps.length}`);
    console.log(`Choice points: ${trace.choicePoints.length}`);
    console.log(`State hashes: ${trace.stateHashes.join(' → ')}`);

    expect(trace.runId).toBe('live-smoke-1');
    expect(trace.pathId).toBe('path-1');
    expect(trace.steps.length).toBeGreaterThan(0);
    expect(trace.choicePoints.length).toBeGreaterThan(0);
    expect(trace.stateHashes.length).toBeGreaterThanOrEqual(2);

    console.log('\nTool calls:');
    for (const step of trace.steps) {
      console.log(`  [${step.encounterId}] ${step.toolName}(${JSON.stringify(step.toolInput).slice(0, 80)})`);
    }

    for (const cp of trace.choicePoints) {
      console.log(`\nChoice @ ${cp.encounterId}:`);
      console.log(`  Chose: ${cp.decision.chosenTool} (confidence: ${cp.decision.confidence})`);
      console.log(`  Reasoning: ${cp.decision.acquisitionReasoning.slice(0, 120)}`);
      if (cp.decision.droppedTool) {
        console.log(`  Dropped: ${cp.decision.droppedTool}`);
        console.log(`  Sacrifice: ${cp.decision.sacrificeReasoning?.slice(0, 120)}`);
      }
    }

    const writer = createArenaTraceWriter({ basePath: tmpDir });
    writer.writeRun('live-smoke', trace);

    const events = writer.readRun('live-smoke', 'live-smoke-1');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('run:header');

    const runRecord = extractRunRecord(trace);
    expect(runRecord.runId).toBe('live-smoke-1');
    console.log(`\nVictory: ${runRecord.isVictory}`);

    const cpRecords = extractChoicePointRecords(trace);
    expect(cpRecords.length).toBe(trace.choicePoints.length);
    for (const cp of cpRecords) {
      console.log(`  CP ${cp.encounterNumber}: ${cp.selectedTool} → ${cp.resultingLineageSha.slice(0, 8)}`);
    }

    console.log('--- End Live Smoke ---\n');
  }, 120_000);
});
