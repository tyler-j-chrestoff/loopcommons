#!/usr/bin/env tsx
/**
 * Lego 2: Single encounter + single live agent.
 *
 * Validates that Haiku actually falls into traps with wrong tools
 * and solves encounters with right tools. One API call per test.
 *
 * Usage:
 *   npx tsx scripts/arena-lego2.ts
 *   npx tsx scripts/arena-lego2.ts --encounter e7
 *   npx tsx scripts/arena-lego2.ts --encounter e7 --tools model,act
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { BRUTAL_ENCOUNTERS } from '../src/arena/brutal-encounters';
import { createSandboxTools } from '../src/arena/sandbox-tools';
import { executeEncounter } from '../src/arena/encounter-engine';
import { encounterResultToTaskResult } from '../src/arena/tournament/task-battery';
import type { ArenaToolId } from '../src/arena/types';
import type { AgentFn } from '../src/arena/encounter-engine';

// Load API key
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
      if (key === 'ANTHROPIC_API_KEY') process.env.ANTHROPIC_API_KEY = value;
    }
  } catch { /* ignore */ }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY required');
  process.exit(1);
}

// Parse args
const args = process.argv.slice(2);
const encIdx = args.indexOf('--encounter');
const toolIdx = args.indexOf('--tools');
const encFilter = encIdx >= 0 ? args[encIdx + 1] : null;
const toolFilter = toolIdx >= 0 ? args[toolIdx + 1].split(',') as ArenaToolId[] : null;

// Test matrix: each row is [encounter, tools, expected outcome]
type TestCase = {
  encounterId: string;
  tools: ArenaToolId[];
  label: string;
  expectDeath: boolean;
};

const TEST_CASES: TestCase[] = [
  // E7: The Hydra — model+act wins, act-only dies
  { encounterId: 'e7', tools: ['act'], label: 'act-only (should die)', expectDeath: true },
  { encounterId: 'e7', tools: ['model', 'act'], label: 'model+act (should solve)', expectDeath: false },

  // E8: The Mimic — inspect required, act-only dies
  { encounterId: 'e8', tools: ['act'], label: 'act-only (should die)', expectDeath: true },
  { encounterId: 'e8', tools: ['inspect', 'act'], label: 'inspect+act (should solve)', expectDeath: false },

  // E9: The Ritual — search+act wins, model+act dies
  { encounterId: 'e9', tools: ['model', 'act'], label: 'model+act (should die)', expectDeath: true },
  { encounterId: 'e9', tools: ['search', 'act'], label: 'search+act (should solve)', expectDeath: false },

  // E12: The Phantom Limb — model+act wins, inspect+act dies
  { encounterId: 'e12', tools: ['inspect', 'act'], label: 'inspect+act (should die)', expectDeath: true },
  { encounterId: 'e12', tools: ['model', 'act'], label: 'model+act (should solve)', expectDeath: false },
];

async function main() {
  const { createLiveAgentFn } = await import('../src/arena/live-agent');

  // Filter test cases
  let cases = TEST_CASES;
  if (encFilter) cases = cases.filter(c => c.encounterId === encFilter);
  if (toolFilter) cases = [{ encounterId: encFilter || 'e7', tools: toolFilter, label: `custom [${toolFilter}]`, expectDeath: false }];

  console.log(`\n  Lego 2: Single Encounter Tests`);
  console.log(`  Cases: ${cases.length}\n`);

  let passed = 0;
  let failed = 0;

  for (const tc of cases) {
    const encounter = BRUTAL_ENCOUNTERS.find(e => e.id === tc.encounterId);
    if (!encounter) { console.error(`  Unknown encounter: ${tc.encounterId}`); continue; }

    const sandbox = encounter.setup();
    const tools = createSandboxTools(sandbox)
      .filter(t => tc.tools.includes(t.name as ArenaToolId));

    const agentFn = createLiveAgentFn();

    const start = Date.now();
    const output = await executeEncounter({
      encounter: { ...encounter, setup: () => sandbox },
      tools,
      agentFn,
      maxSteps: 12,
    });
    const elapsed = Date.now() - start;

    const taskResult = encounterResultToTaskResult(tc.encounterId, output);
    const dead = output.death.dead;
    const resolved = output.encounterResult.resolved;
    const score = output.encounterResult.score;

    // Check expectation
    const matched = tc.expectDeath ? (dead || score === 0) : resolved;
    const icon = matched ? '✓' : '✗';
    if (matched) passed++; else failed++;

    console.log(`  ${icon} ${encounter.name} [${tc.tools.join('+')}] — ${tc.label}`);
    console.log(`    resolved=${resolved} score=${score.toFixed(2)} dead=${dead} steps=${output.steps.length} ${elapsed}ms`);
    console.log(`    details: ${output.encounterResult.details}`);
    if (output.response) {
      console.log(`    response: ${output.response.slice(0, 800)}`);
    }

    // Show tool calls
    if (output.steps.length > 0) {
      console.log(`    tools used:`);
      for (const step of output.steps.slice(0, 5)) {
        const inputStr = JSON.stringify(step.toolInput).slice(0, 80);
        console.log(`      ${step.toolName}(${inputStr}) → ${step.toolOutput.slice(0, 200)}`);
      }
      if (output.steps.length > 5) console.log(`      ... +${output.steps.length - 5} more`);
    }
    console.log();
  }

  console.log(`  Results: ${passed} passed, ${failed} failed out of ${cases.length}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
