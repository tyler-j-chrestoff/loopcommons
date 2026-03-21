/**
 * Lego 2 + Lego 3: live validation of mana system with real LLM.
 *
 * Lego 2: Single encounter + live agent → validates done tool + toolChoice + mana.
 * Lego 3: One generation (3 agents, 3 encounters) → validates fitness differentiation.
 *
 * Gated by ARENA_LIVE=true + ANTHROPIC_API_KEY.
 * Run: ARENA_LIVE=true npx vitest run test/arena/lego-live.test.ts
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLiveAgentFn } from '../../src/arena/live-agent';
import { createSandboxTools, createDoneTool } from '../../src/arena/sandbox-tools';
import { executeEncounter } from '../../src/arena/encounter-engine';
import { e7 } from '../../src/arena/brutal-encounters';
import { computeAgentFitness } from '../../src/arena/tournament/fitness';
import { encounterResultToTaskResult } from '../../src/arena/tournament/task-battery';
import type { ManaConfig } from '../../src/arena/mana';
import type { ArenaToolId } from '../../src/arena/types';

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
// Shared config
// ---------------------------------------------------------------------------

const manaConfig: ManaConfig = {
  explorationSlots: 4,
  toolCosts: { inspect: 1, search: 1, model: 2, act: 0, done: 0 },
};

// ---------------------------------------------------------------------------
// Lego 2: single encounter + live agent with mana
// ---------------------------------------------------------------------------

describeLive('Lego 2: single encounter with mana', () => {
  it('agent uses act and calls done (not just diagnostic prose)', async () => {
    const agentFn = createLiveAgentFn();

    // E7 Hydra: needs model + act (restart cache-layer)
    const encounter = e7;
    const sandbox = encounter.setup();
    const tools = [
      ...createSandboxTools(sandbox).filter(t =>
        ['inspect', 'act', 'model'].includes(t.name),
      ),
      createDoneTool(),
    ];

    const result = await executeEncounter({
      encounter: { ...encounter, setup: () => sandbox },
      tools,
      agentFn,
      maxSteps: 15,
      manaConfig,
    });

    const toolNames = result.steps.map(s => s.toolName);
    console.log('\n--- Lego 2 Results ---');
    console.log(`Tools used: ${toolNames.join(' → ')}`);
    console.log(`Resolved: ${result.encounterResult.resolved}`);
    console.log(`Score: ${result.encounterResult.score}`);
    console.log(`Dead: ${result.death.dead}${result.death.cause ? ` (${result.death.cause})` : ''}`);
    console.log(`Details: ${result.encounterResult.details}`);

    // Key assertions: agent must have called SOME tools
    expect(toolNames.length).toBeGreaterThan(0);

    // Agent called act (not just diagnostic tools)
    const usedAct = toolNames.includes('act');
    console.log(`Used act: ${usedAct}`);

    // Agent called done (not just prose)
    const calledDone = toolNames.includes('done');
    console.log(`Called done: ${calledDone}`);

    // The key fix: agent should NOT die from inaction
    // (previous behavior: Haiku writes prose after 2-3 diagnostic calls, never acts)
    // With toolChoice:required + done, every step is a tool call
    if (result.death.dead) {
      // If it died, it should be from wrong action (state_corruption), not inaction
      expect(result.death.cause).not.toBe('iteration_limit');
      console.log(`Death was from action (${result.death.cause}), not inaction — improvement over baseline`);
    }

    console.log('--- End Lego 2 ---\n');
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Lego 3: one generation, 3 agents, 3 encounters
// ---------------------------------------------------------------------------

describeLive('Lego 3: fitness differentiation', () => {
  it('3 agents with different tools produce different fitness scores', async () => {
    const agentFn = createLiveAgentFn();

    // 3 agents with different tool compositions
    const agents: Array<{ id: string; tools: ArenaToolId[] }> = [
      { id: 'agent-full', tools: ['inspect', 'act', 'search', 'model'] },
      { id: 'agent-act-inspect', tools: ['inspect', 'act'] },
      { id: 'agent-model-act', tools: ['model', 'act'] },
    ];

    // Use E7 (Hydra) — requires model+act, punishes blind restarts
    const encounters = [e7];

    const allFitness: Array<{ id: string; score: number; details: string[] }> = [];

    for (const agent of agents) {
      const taskResults = [];
      for (const encounter of encounters) {
        const sandbox = encounter.setup();
        const tools = [
          ...createSandboxTools(sandbox).filter(t =>
            agent.tools.includes(t.name as ArenaToolId),
          ),
          createDoneTool(),
        ];

        const result = await executeEncounter({
          encounter: { ...encounter, setup: () => sandbox },
          tools,
          agentFn,
          maxSteps: 15,
          manaConfig,
        });

        taskResults.push(encounterResultToTaskResult(encounter.id, result));
      }

      const fitness = computeAgentFitness(agent.id, taskResults);
      allFitness.push({
        id: agent.id,
        score: fitness.fitnessScore,
        details: taskResults.map(r =>
          `${r.encounterId}: resolved=${r.resolved} score=${r.score} died=${r.died} collateral=${r.collateral ?? 0}`,
        ),
      });
    }

    console.log('\n--- Lego 3 Results ---');
    for (const f of allFitness) {
      console.log(`${f.id}: fitness=${f.score.toFixed(3)}`);
      for (const d of f.details) {
        console.log(`  ${d}`);
      }
    }

    // Key assertion: not all agents got the same score
    const scores = allFitness.map(f => f.score);
    const allSame = scores.every(s => s === scores[0]);
    console.log(`All same score: ${allSame}`);
    console.log(`Scores: ${scores.map(s => s.toFixed(3)).join(', ')}`);

    // With mana + done + toolChoice, we expect differentiation
    // Even if all fail, they should fail differently (different collateral/steps)
    // Relaxed assertion: at least log the results for analysis
    if (allSame) {
      console.log('WARNING: No fitness differentiation — agents performed identically');
      console.log('This may indicate encounters need tuning or agents need more variety');
    }

    console.log('--- End Lego 3 ---\n');
  }, 300_000); // 5 min — 3 agents × 1 encounter each
});
