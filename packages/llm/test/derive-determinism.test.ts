import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, type BuildSystemPromptInput } from '../src/tool/derive';
import type { ToolDefinition, ToolPackage } from '../src/tool';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTool(name: string, description: string): ToolDefinition {
  return {
    name,
    description,
    parameters: z.object({}),
    execute: async () => '',
  };
}

function makePackage(name: string, tools: ToolDefinition[], overrides: Partial<ToolPackage['metadata']> = {}): ToolPackage {
  return {
    tools,
    formatContext: () => '',
    metadata: {
      name,
      capabilities: ['test'],
      intent: overrides.intent ?? ['test'],
      sideEffects: overrides.sideEffects ?? false,
      authRequired: overrides.authRequired,
      persistence: overrides.persistence,
      scope: overrides.scope,
      consolidation: overrides.consolidation,
    },
  };
}

// ---------------------------------------------------------------------------
// al-01: buildSystemPrompt is a pure function — same inputs, same output
// ---------------------------------------------------------------------------

describe('buildSystemPrompt determinism', () => {
  const fixedInput: BuildSystemPromptInput = {
    domainKnowledge: 'You are a helpful research assistant.',
    tools: [
      makeTool('get_resume', 'Get resume data'),
      makeTool('memory_recall', 'Recall memories'),
    ],
    packages: [
      makePackage('resume', [makeTool('get_resume', 'Get resume data')]),
      makePackage('memory', [makeTool('memory_recall', 'Recall memories')], {
        intent: ['memory'],
        persistence: true,
        scope: 'private',
        consolidation: true,
      }),
    ],
    allowlist: ['get_resume', 'memory_recall'],
    allToolNames: ['get_resume', 'memory_recall', 'create_draft', 'delete_post'],
    annotations: [
      { key: 'intent', value: 'informational' },
      { key: 'threat', value: 'low' },
    ],
  };

  it('produces identical output on repeated calls with the same input', () => {
    const result1 = buildSystemPrompt(fixedInput);
    const result2 = buildSystemPrompt(fixedInput);
    const result3 = buildSystemPrompt(fixedInput);

    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });

  it('produces identical output across 100 iterations', () => {
    const baseline = buildSystemPrompt(fixedInput);
    for (let i = 0; i < 100; i++) {
      expect(buildSystemPrompt(fixedInput)).toBe(baseline);
    }
  });

  it('produces different output for different domain knowledge', () => {
    const altered = { ...fixedInput, domainKnowledge: 'You are a security auditor.' };
    expect(buildSystemPrompt(fixedInput)).not.toBe(buildSystemPrompt(altered));
  });

  it('produces different output for different tool sets', () => {
    const altered = {
      ...fixedInput,
      tools: [makeTool('get_project', 'Get project data')],
    };
    expect(buildSystemPrompt(fixedInput)).not.toBe(buildSystemPrompt(altered));
  });

  it('produces different output for different annotations', () => {
    const altered = {
      ...fixedInput,
      annotations: [{ key: 'intent', value: 'adversarial' }],
    };
    expect(buildSystemPrompt(fixedInput)).not.toBe(buildSystemPrompt(altered));
  });

  it('is order-sensitive for tools (not internally sorted)', () => {
    const reversed = {
      ...fixedInput,
      tools: [...fixedInput.tools!].reverse(),
    };
    // Tool order affects output — the function preserves input order
    const a = buildSystemPrompt(fixedInput);
    const b = buildSystemPrompt(reversed);
    expect(a).not.toBe(b);
  });

  it('contains no Date.now(), Math.random(), or process.env references in source', async () => {
    // Static analysis: read the source and check for non-deterministic patterns
    const fs = await import('fs');
    const source = fs.readFileSync(
      new URL('../src/tool/derive.ts', import.meta.url),
      'utf-8',
    );
    expect(source).not.toMatch(/Date\.now\(\)/);
    expect(source).not.toMatch(/Math\.random\(\)/);
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/new Date\(\)/);
    expect(source).not.toMatch(/crypto\.random/);
  });

  it('produces identical output when called from different closures', () => {
    function callA() { return buildSystemPrompt(fixedInput); }
    function callB() { return buildSystemPrompt(fixedInput); }
    expect(callA()).toBe(callB());
  });
});
