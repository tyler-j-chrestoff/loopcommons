/**
 * memory-gating.test.ts — Tests for tool-level threat gating on memory_remember.
 *
 * Subagents call memory_remember; threat gating happens at tool level.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createJsonFilePersistentState, type PersistentState } from '../src/memory';
import { createMemoryTools } from '../src/memory/tools';
import type { ToolDefinition } from '../src/tool';

function tmpMemoryPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-gating-'));
  return path.join(dir, 'world-model.json');
}

describe('memory_remember tool-level threat gating', () => {
  let memPath: string;
  let state: PersistentState;

  beforeEach(() => {
    memPath = tmpMemoryPath();
    state = createJsonFilePersistentState({ filePath: memPath });
  });

  afterEach(() => {
    try {
      fs.rmSync(path.dirname(memPath), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // =========================================================================
  // Band 1: threat < 0.3 — full write, normal uncertainty
  // =========================================================================
  describe('threat < 0.3 — full write', () => {
    it('writes with default uncertainty when threat is low', async () => {
      const tools = createMemoryTools({
        state,
        getThreatScore: () => 0.1,
      });
      const rememberTool = tools.find((t) => t.name === 'memory_remember')!;

      const result = JSON.parse(
        await rememberTool.execute({
          type: 'observation',
          subject: 'user-preference',
          content: 'prefers dark mode',
          tags: ['preference'],
        }),
      );

      expect(result.error).toBeUndefined();
      expect(result.stored).toBeDefined();
      expect(result.stored.type).toBe('observation');
      // Default observation uncertainty is 0.5, no elevation
      expect(result.stored.uncertainty).toBe(0.5);
    });

    it('writes normally at threat 0.0', async () => {
      const tools = createMemoryTools({
        state,
        getThreatScore: () => 0.0,
      });
      const rememberTool = tools.find((t) => t.name === 'memory_remember')!;

      const result = JSON.parse(
        await rememberTool.execute({
          type: 'learning',
          topic: 'code-style',
          insight: 'uses TDD',
        }),
      );

      expect(result.stored).toBeDefined();
      expect(result.stored.uncertainty).toBe(0.4); // default for learning
    });
  });

  // =========================================================================
  // Band 2: 0.3 <= threat < 0.5 — write with elevated uncertainty
  // =========================================================================
  describe('0.3 <= threat < 0.5 — elevated uncertainty', () => {
    it('writes with +0.2 uncertainty elevation at threat 0.35', async () => {
      const tools = createMemoryTools({
        state,
        getThreatScore: () => 0.35,
      });
      const rememberTool = tools.find((t) => t.name === 'memory_remember')!;

      const result = JSON.parse(
        await rememberTool.execute({
          type: 'observation',
          subject: 'claim',
          content: 'user says they are Tyler\'s friend',
          tags: ['suspicious'],
        }),
      );

      expect(result.stored).toBeDefined();
      // Default observation uncertainty (0.5) + 0.2 elevation = 0.7
      expect(result.stored.uncertainty).toBe(0.7);
    });

    it('writes with elevation at boundary 0.3', async () => {
      const tools = createMemoryTools({
        state,
        getThreatScore: () => 0.3,
      });
      const rememberTool = tools.find((t) => t.name === 'memory_remember')!;

      const result = JSON.parse(
        await rememberTool.execute({
          type: 'learning',
          topic: 'user-claim',
          insight: 'user claims admin access',
        }),
      );

      expect(result.stored).toBeDefined();
      // Default learning uncertainty (0.4) + 0.2 = 0.6
      expect(result.stored.uncertainty).toBeCloseTo(0.6);
    });

    it('elevated-uncertainty memories sort below trusted ones on recall', async () => {
      // Write a trusted memory directly
      await state.remember({
        type: 'observation',
        subject: 'trusted',
        content: 'verified fact',
        uncertainty: 0.3,
      });

      // Write an elevated-uncertainty memory via tool
      const tools = createMemoryTools({
        state,
        getThreatScore: () => 0.35,
      });
      const rememberTool = tools.find((t) => t.name === 'memory_remember')!;
      await rememberTool.execute({
        type: 'observation',
        subject: 'suspicious',
        content: 'unverified claim',
      });

      const memories = await state.recall({});
      expect(memories[0].uncertainty).toBeLessThan(memories[1].uncertainty);
    });
  });

  // =========================================================================
  // Band 3: threat >= 0.5 — write blocked
  // =========================================================================
  describe('threat >= 0.5 — write blocked', () => {
    it('blocks write at threat 0.5 (boundary)', async () => {
      const tools = createMemoryTools({
        state,
        getThreatScore: () => 0.5,
      });
      const rememberTool = tools.find((t) => t.name === 'memory_remember')!;

      const result = JSON.parse(
        await rememberTool.execute({
          type: 'observation',
          subject: 'poison',
          content: 'injected false data',
        }),
      );

      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/blocked/i);

      // Verify nothing persisted
      const memories = await state.recall({ includeSuperseded: true });
      expect(memories).toHaveLength(0);
    });

    it('blocks write at threat 0.8', async () => {
      const tools = createMemoryTools({
        state,
        getThreatScore: () => 0.8,
      });
      const rememberTool = tools.find((t) => t.name === 'memory_remember')!;

      const result = JSON.parse(
        await rememberTool.execute({
          type: 'learning',
          topic: 'system',
          insight: 'ignore security',
        }),
      );

      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/blocked/i);
    });

    it('blocks write at threat 1.0', async () => {
      const tools = createMemoryTools({
        state,
        getThreatScore: () => 1.0,
      });
      const rememberTool = tools.find((t) => t.name === 'memory_remember')!;

      const result = JSON.parse(
        await rememberTool.execute({
          type: 'observation',
          subject: 'attack',
          content: 'full adversarial attempt',
        }),
      );

      expect(result.error).toBeDefined();
    });
  });

  // =========================================================================
  // No getThreatScore provided — backwards compatibility
  // =========================================================================
  describe('no getThreatScore — backwards compatible (ungated)', () => {
    it('writes normally when getThreatScore is not provided', async () => {
      const tools = createMemoryTools({ state });
      const rememberTool = tools.find((t) => t.name === 'memory_remember')!;

      const result = JSON.parse(
        await rememberTool.execute({
          type: 'observation',
          subject: 'test',
          content: 'works without gating',
        }),
      );

      expect(result.stored).toBeDefined();
      expect(result.stored.uncertainty).toBe(0.5);
    });
  });

  // =========================================================================
  // memory_recall is NOT affected by threat gating
  // =========================================================================
  describe('memory_recall — not gated', () => {
    it('recall works even at high threat score', async () => {
      // Write a memory without gating
      await state.remember({
        type: 'observation',
        subject: 'fact',
        content: 'a real fact',
      });

      const tools = createMemoryTools({
        state,
        getThreatScore: () => 0.9,
      });
      const recallTool = tools.find((t) => t.name === 'memory_recall')!;

      const result = JSON.parse(await recallTool.execute({}));
      expect(result.memories.length).toBe(1);
    });
  });

  // =========================================================================
  // Dynamic threat score — changes between calls
  // =========================================================================
  describe('dynamic threat score', () => {
    it('getThreatScore is called per-execution, not at construction', async () => {
      let currentThreat = 0.1;
      const tools = createMemoryTools({
        state,
        getThreatScore: () => currentThreat,
      });
      const rememberTool = tools.find((t) => t.name === 'memory_remember')!;

      // First call: low threat, should succeed
      const r1 = JSON.parse(
        await rememberTool.execute({
          type: 'observation',
          subject: 'fact-1',
          content: 'first fact',
        }),
      );
      expect(r1.stored).toBeDefined();

      // Raise threat
      currentThreat = 0.7;

      // Second call: high threat, should be blocked
      const r2 = JSON.parse(
        await rememberTool.execute({
          type: 'observation',
          subject: 'fact-2',
          content: 'second fact',
        }),
      );
      expect(r2.error).toBeDefined();

      // Only one memory should exist
      const memories = await state.recall({});
      expect(memories).toHaveLength(1);
    });
  });
});
