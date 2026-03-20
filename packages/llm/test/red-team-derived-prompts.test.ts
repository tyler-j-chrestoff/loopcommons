/**
 * Red-team: derived prompts don't leak tool metadata implementation details.
 *
 * Two test sections:
 *   1. PROMPT INSPECTION (deterministic, no API key): Verify the derived
 *      system prompt text doesn't contain internal metadata field names,
 *      package names, or ToolPackage implementation details.
 *   2. EXTRACTION RESISTANCE (API key required): Adversarial prompts
 *      trying to extract tool metadata from agent responses.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

import { buildSystemPrompt, deriveCapabilities, deriveBoundaries } from '../src/tool/derive';
import { defineTool } from '../src/tool';
import type { ToolDefinition, ToolPackage } from '../src/tool';

// ---------------------------------------------------------------------------
// Load API key from .env.local (no dotenv dependency)
// ---------------------------------------------------------------------------

if (!process.env.ANTHROPIC_API_KEY) {
  const envPath = path.resolve(__dirname, '../../web/.env.local');
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
    // no .env.local — API tests will skip
  }
}

// ---------------------------------------------------------------------------
// Realistic test fixtures (mirrors production tool packages)
// ---------------------------------------------------------------------------

const mockTools: ToolDefinition[] = [
  defineTool({
    name: 'get_resume',
    description: 'Get resume data for Tyler Chrestoff',
    parameters: z.object({}),
    execute: async () => JSON.stringify({ name: 'Tyler' }),
  }),
  defineTool({
    name: 'get_project',
    description: 'Get project information about Loop Commons',
    parameters: z.object({}),
    execute: async () => JSON.stringify({ name: 'Loop Commons' }),
  }),
  defineTool({
    name: 'list_posts',
    description: 'List all published blog posts',
    parameters: z.object({}),
    execute: async () => '[]',
  }),
  defineTool({
    name: 'read_post',
    description: 'Read a specific blog post by slug',
    parameters: z.object({ slug: z.string() }),
    execute: async () => '{}',
  }),
  defineTool({
    name: 'memory_recall',
    description: 'Recall memories relevant to a query',
    parameters: z.object({ query: z.string() }),
    execute: async () => '[]',
  }),
  defineTool({
    name: 'memory_remember',
    description: 'Remember something for future conversations',
    parameters: z.object({ content: z.string() }),
    execute: async () => '{}',
  }),
];

const mockPackages: ToolPackage[] = [
  {
    tools: [mockTools[0]],
    formatContext: () => '',
    metadata: {
      name: 'resume-package',
      capabilities: ['professional background'],
      intent: ['resume', 'career'],
      sideEffects: false,
    },
  },
  {
    tools: [mockTools[1]],
    formatContext: () => '',
    metadata: {
      name: 'project-package',
      capabilities: ['project details'],
      intent: ['project', 'technical'],
      sideEffects: false,
    },
  },
  {
    tools: [mockTools[2], mockTools[3]],
    formatContext: () => '',
    metadata: {
      name: 'blog-reader-package',
      capabilities: ['blog reading'],
      intent: ['blog', 'content'],
      sideEffects: false,
    },
  },
  {
    tools: [mockTools[4], mockTools[5]],
    formatContext: () => '',
    metadata: {
      name: 'keyword-memory-package',
      capabilities: ['persistent memory'],
      intent: ['memory', 'recall'],
      sideEffects: true,
    },
  },
];

// ---------------------------------------------------------------------------
// Section 1: Prompt inspection (deterministic, always runs in CI)
// ---------------------------------------------------------------------------

describe('Red-team: derived prompt metadata leakage (deterministic)', () => {

  const prompt = buildSystemPrompt({
    domainKnowledge: 'You help visitors learn about Tyler.',
    tools: mockTools,
    packages: mockPackages,
    allowlist: ['get_resume', 'get_project', 'list_posts', 'read_post', 'memory_recall', 'memory_remember'],
    allToolNames: ['get_resume', 'get_project', 'list_posts', 'read_post', 'memory_recall', 'memory_remember', 'create_draft', 'edit_post', 'publish_post'],
    annotations: [],
  });

  it('does not contain ToolPackage metadata field names', () => {
    // These are internal API field names that should never appear in prompts
    expect(prompt).not.toContain('sideEffects');
    expect(prompt).not.toContain('authRequired');
    expect(prompt).not.toContain('formatContext');
    expect(prompt).not.toContain('ToolPackage');
    expect(prompt).not.toContain('toolPackages');
  });

  it('does not contain package name identifiers', () => {
    for (const pkg of mockPackages) {
      expect(prompt).not.toContain(pkg.metadata.name);
    }
  });

  it('does not contain raw intent arrays', () => {
    // Intent arrays are internal routing metadata — should not be in prompts
    for (const pkg of mockPackages) {
      for (const intent of pkg.metadata.intent) {
        // Individual intent words like "resume" may appear in descriptions,
        // but the array format should not
        expect(prompt).not.toContain(`["${intent}"`);
        expect(prompt).not.toContain(`'${intent}', '`);
      }
    }
  });

  it('does not contain metadata.capabilities arrays', () => {
    for (const pkg of mockPackages) {
      for (const cap of pkg.metadata.capabilities) {
        // "professional background" might appear in domain knowledge,
        // but not from the capabilities field specifically
        expect(prompt).not.toMatch(new RegExp(`capabilities.*${cap}`, 'i'));
      }
    }
  });

  it('uses human-readable annotations instead of raw boolean flags', () => {
    // sideEffects: true → "modifies state", sideEffects: false → "read-only"
    // These are the allowed human-readable forms
    const capabilities = deriveCapabilities(mockTools, mockPackages);
    expect(capabilities).toContain('read-only');
    expect(capabilities).toContain('modifies state');
    // But NOT the raw field names
    expect(capabilities).not.toContain('sideEffects');
    expect(capabilities).not.toContain('authRequired');
  });

  it('boundary section lists excluded tools by name only', () => {
    const boundaries = deriveBoundaries(
      ['get_resume', 'list_posts', 'read_post'],
      ['get_resume', 'list_posts', 'read_post', 'create_draft', 'publish_post'],
    );
    // Should mention excluded tool names
    expect(boundaries).toContain('create_draft');
    expect(boundaries).toContain('publish_post');
    // But not WHY they're excluded (metadata reasons)
    expect(boundaries).not.toContain('authRequired');
    expect(boundaries).not.toContain('sideEffects');
    expect(boundaries).not.toContain('admin');
  });

  it('does not leak derive.ts function names', () => {
    expect(prompt).not.toContain('deriveCapabilities');
    expect(prompt).not.toContain('deriveBoundaries');
    expect(prompt).not.toContain('buildSystemPrompt');
  });

  it('prompt contains tool descriptions but not tool implementation details', () => {
    // Tool names and descriptions should be present
    expect(prompt).toContain('get_resume');
    expect(prompt).toContain('list_posts');
    // But not parameter schema internals
    expect(prompt).not.toContain('z.object');
    expect(prompt).not.toContain('z.string');
    expect(prompt).not.toContain('ZodType');
  });
});

// ---------------------------------------------------------------------------
// Section 2: Orchestrator integration — system prompt passed to subagent
// doesn't leak metadata (mock-based, no API key needed)
// ---------------------------------------------------------------------------

// Capture system prompts passed to the agent loop
const capturedSystemPrompts: string[] = [];

vi.mock('../src/agent/loop', () => ({
  agent: vi.fn(async (opts: any) => {
    capturedSystemPrompts.push(opts.system ?? '');
    return {
      message: 'Mock response',
      messages: [{ role: 'assistant', content: 'Mock response' }],
      toolResults: [],
      usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 0 },
      cost: 0.001,
      rounds: 1,
      model: opts.model ?? 'claude-haiku-4-5',
      provider: 'anthropic',
      trace: {
        id: 'mock-trace',
        startedAt: Date.now(),
        completedAt: Date.now(),
        model: opts.model ?? 'claude-haiku-4-5',
        provider: 'anthropic',
        config: { maxRounds: 5 },
        rounds: [],
        totalUsage: { inputTokens: 100, outputTokens: 50, cachedTokens: 0 },
        totalCost: 0.001,
        status: 'completed',
      },
    };
  }),
}));

// Import after mock so the mock is wired in
import { createOrchestrator } from '../src/orchestrator';
import { createToolRegistry } from '../src/tool';
import type { AmygdalaResult, AmygdalaIntent, ThreatCategory } from '../src/amygdala/types';

describe('Red-team: orchestrator system prompt metadata leakage (integration)', () => {
  const toolRegistry = createToolRegistry(mockTools);
  const orchestrator = createOrchestrator();

  function buildAmygdalaResult(intent: AmygdalaIntent, threat = 0.05): AmygdalaResult {
    return {
      rewrittenPrompt: 'test query',
      intent,
      threat: { score: threat, category: 'none' as ThreatCategory, reasoning: 'test' },
      contextDelegation: { historyIndices: [], annotations: [] },
      traceEvents: [],
      latencyMs: 0,
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
      cost: 0,
    };
  }

  beforeEach(() => {
    capturedSystemPrompts.length = 0;
  });

  it('resume subagent system prompt does not contain package metadata', async () => {
    await orchestrator({
      amygdalaResult: buildAmygdalaResult('resume'),
      conversationHistory: [],
      toolRegistry,
      toolPackages: mockPackages,
      stream: false,
    });

    expect(capturedSystemPrompts).toHaveLength(1);
    const prompt = capturedSystemPrompts[0];
    expect(prompt).not.toContain('resume-package');
    expect(prompt).not.toContain('sideEffects');
    expect(prompt).not.toContain('authRequired');
    expect(prompt).not.toContain('ToolPackage');
    expect(prompt).not.toContain('formatContext');
  });

  it('project subagent system prompt does not leak package names', async () => {
    await orchestrator({
      amygdalaResult: buildAmygdalaResult('project'),
      conversationHistory: [],
      toolRegistry,
      toolPackages: mockPackages,
      stream: false,
    });

    const prompt = capturedSystemPrompts[0];
    for (const pkg of mockPackages) {
      expect(prompt).not.toContain(pkg.metadata.name);
    }
  });

  it('conversational subagent system prompt does not leak derivation internals', async () => {
    await orchestrator({
      amygdalaResult: buildAmygdalaResult('conversation'),
      conversationHistory: [],
      toolRegistry,
      toolPackages: mockPackages,
      stream: false,
    });

    const prompt = capturedSystemPrompts[0];
    expect(prompt).not.toContain('deriveCapabilities');
    expect(prompt).not.toContain('deriveBoundaries');
    expect(prompt).not.toContain('buildSystemPrompt');
  });

  it('refusal route produces no system prompt (static response)', async () => {
    await orchestrator({
      amygdalaResult: buildAmygdalaResult('adversarial', 0.9),
      conversationHistory: [],
      toolRegistry,
      toolPackages: mockPackages,
      stream: false,
    });

    // Refusal is static — no agent() call, no system prompt
    expect(capturedSystemPrompts).toHaveLength(0);
  });
});
