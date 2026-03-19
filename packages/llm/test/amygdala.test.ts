import { describe, it, expect } from 'vitest';
import { createSubagentRegistry } from '../src/subagent';
import { createToolRegistry, createScopedRegistry } from '../src/tool';
import { defineTool } from '../src/tool';
import { z } from 'zod';
import type { AmygdalaIntent } from '../src/amygdala/types';
import { getIntentSchema, getSystemPrompt } from '../src/amygdala/index';

// ---------------------------------------------------------------------------
// Blog intent type-level test
// ---------------------------------------------------------------------------

describe('AmygdalaIntent — blog', () => {
  it('"blog" is a valid AmygdalaIntent value', () => {
    const blogIntent: AmygdalaIntent = 'blog';
    expect(blogIntent).toBe('blog');
  });

  it('blog is included in the intent Zod schema', () => {
    const schema = getIntentSchema();
    const result = schema.safeParse('blog');
    expect(result.success).toBe(true);
  });

  it('system prompt mentions blog intent', () => {
    const prompt = getSystemPrompt();
    expect(prompt).toContain('"blog"');
    expect(prompt).toMatch(/blog.*post/i);
  });
});

// ---------------------------------------------------------------------------
// Subagent Registry
// ---------------------------------------------------------------------------

describe('SubagentRegistry', () => {
  const registry = createSubagentRegistry();

  it('maps each intent to a subagent', () => {
    const intents: AmygdalaIntent[] = [
      'resume', 'project', 'conversation', 'security', 'meta', 'unclear', 'adversarial', 'blog',
    ];
    for (const intent of intents) {
      const config = registry.get(intent);
      expect(config).toBeDefined();
      expect(config.id).toBeTruthy();
    }
  });

  it('routes resume intent to resume subagent with get_resume tool', () => {
    const config = registry.get('resume');
    expect(config.id).toBe('resume');
    expect(config.toolAllowlist).toEqual(['get_resume', 'memory_recall']);
  });

  it('routes project intent to project subagent with get_project tool', () => {
    const config = registry.get('project');
    expect(config.id).toBe('project');
    expect(config.toolAllowlist).toEqual(['get_project', 'memory_recall']);
  });

  it('routes adversarial intent to refusal subagent with no tools', () => {
    const config = registry.get('adversarial');
    expect(config.id).toBe('refusal');
    expect(config.toolAllowlist).toEqual([]);
    expect(config.contextRequirements.maxHistoryMessages).toBe(1);
  });

  it('routes blog intent to blog-reader by default', () => {
    const config = registry.get('blog');
    expect(config.id).toBe('blog-reader');
    expect(config.toolAllowlist).toContain('list_posts');
    expect(config.toolAllowlist).toContain('read_post');
  });

  it('routes conversation, meta, unclear to conversational fallback', () => {
    const conv = registry.get('conversation');
    const meta = registry.get('meta');
    const unclear = registry.get('unclear');
    expect(conv.id).toBe('conversational');
    expect(meta.id).toBe('conversational');
    expect(unclear.id).toBe('conversational');
  });

  it('security subagent has no tools', () => {
    const config = registry.get('security');
    expect(config.toolAllowlist).toEqual([]);
  });

  it('list() returns distinct subagent configs', () => {
    const all = registry.list();
    const ids = all.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    expect(ids).toContain('resume');
    expect(ids).toContain('project');
    expect(ids).toContain('blog-reader');
    expect(ids).toContain('blog-writer');
    expect(ids).toContain('security');
    expect(ids).toContain('conversational');
    expect(ids).toContain('refusal');
  });
});

// ---------------------------------------------------------------------------
// Scoped Tool Registry
// ---------------------------------------------------------------------------

describe('createScopedRegistry', () => {
  const mockTool1 = defineTool({
    name: 'get_resume',
    description: 'Get resume data',
    parameters: z.object({}),
    execute: async () => 'resume data',
  });

  const mockTool2 = defineTool({
    name: 'get_project',
    description: 'Get project data',
    parameters: z.object({}),
    execute: async () => 'project data',
  });

  const mockTool3 = defineTool({
    name: 'get_security_status',
    description: 'Get security status',
    parameters: z.object({}),
    execute: async () => 'status',
  });

  const fullRegistry = createToolRegistry([mockTool1, mockTool2, mockTool3]);

  it('returns only allowed tools', () => {
    const scoped = createScopedRegistry(fullRegistry, ['get_resume']);
    expect(scoped.list()).toEqual(['get_resume']);
    expect(scoped.has('get_resume')).toBe(true);
    expect(scoped.has('get_project')).toBe(false);
    expect(scoped.has('get_security_status')).toBe(false);
  });

  it('returns empty registry for empty allowlist', () => {
    const scoped = createScopedRegistry(fullRegistry, []);
    expect(scoped.list()).toEqual([]);
    expect(scoped.has('get_resume')).toBe(false);
  });

  it('ignores allowlist names that do not exist in full registry', () => {
    const scoped = createScopedRegistry(fullRegistry, ['get_resume', 'nonexistent']);
    expect(scoped.list()).toEqual(['get_resume']);
  });

  it('scoped registry executes tools correctly', async () => {
    const scoped = createScopedRegistry(fullRegistry, ['get_project']);
    const tool = scoped.get('get_project');
    expect(tool).toBeDefined();
    const result = await tool!.execute({});
    expect(result).toBe('project data');
  });

  it('toProviderFormat only includes scoped tools', () => {
    const scoped = createScopedRegistry(fullRegistry, ['get_resume']);
    const formatted = scoped.toProviderFormat();
    expect(Object.keys(formatted)).toEqual(['get_resume']);
  });
});

// ---------------------------------------------------------------------------
// Integration: Registry + Scoped Tools
// ---------------------------------------------------------------------------

describe('Integration: SubagentRegistry + ScopedTools', () => {
  const mockTools = [
    defineTool({
      name: 'get_resume',
      description: 'Get resume',
      parameters: z.object({}),
      execute: async () => 'resume',
    }),
    defineTool({
      name: 'get_project',
      description: 'Get project',
      parameters: z.object({}),
      execute: async () => 'project',
    }),
  ];

  const fullRegistry = createToolRegistry(mockTools);
  const subagentRegistry = createSubagentRegistry();

  it('resume subagent gets only get_resume tool', () => {
    const config = subagentRegistry.get('resume');
    const scoped = createScopedRegistry(fullRegistry, config.toolAllowlist);
    expect(scoped.list()).toEqual(['get_resume']);
  });

  it('project subagent gets only get_project tool', () => {
    const config = subagentRegistry.get('project');
    const scoped = createScopedRegistry(fullRegistry, config.toolAllowlist);
    expect(scoped.list()).toEqual(['get_project']);
  });

  it('adversarial routing produces zero-tool registry', () => {
    const config = subagentRegistry.get('adversarial');
    const scoped = createScopedRegistry(fullRegistry, config.toolAllowlist);
    expect(scoped.list()).toEqual([]);
  });

  it('conversational routing produces zero-tool registry', () => {
    const config = subagentRegistry.get('conversation');
    const scoped = createScopedRegistry(fullRegistry, config.toolAllowlist);
    expect(scoped.list()).toEqual([]);
  });
});
