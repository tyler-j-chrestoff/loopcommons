import { describe, it, expect } from 'vitest';
import { deriveCapabilities, deriveBoundaries, buildSystemPrompt } from '../src/tool/derive';
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

function makePackage(overrides: Partial<ToolPackage['metadata']> & { tools?: ToolDefinition[] } = {}): ToolPackage {
  const tools = overrides.tools ?? [makeTool('test_tool', 'A test tool')];
  return {
    tools,
    formatContext: () => '',
    metadata: {
      name: overrides.name ?? 'test',
      capabilities: overrides.capabilities ?? ['testing'],
      intent: overrides.intent ?? ['test'],
      sideEffects: overrides.sideEffects ?? false,
      authRequired: overrides.authRequired,
    },
  };
}

// ---------------------------------------------------------------------------
// dp-01: deriveCapabilities
// ---------------------------------------------------------------------------

describe('deriveCapabilities', () => {
  it('returns empty string for empty tool list', () => {
    expect(deriveCapabilities([])).toBe('');
  });

  it('lists each tool with name and description', () => {
    const tools = [
      makeTool('get_resume', 'Retrieve resume information'),
      makeTool('list_posts', 'List published blog posts'),
    ];
    const result = deriveCapabilities(tools);
    expect(result).toContain('get_resume');
    expect(result).toContain('Retrieve resume information');
    expect(result).toContain('list_posts');
    expect(result).toContain('List published blog posts');
  });

  it('produces markdown list format', () => {
    const tools = [makeTool('get_resume', 'Retrieve resume information')];
    const result = deriveCapabilities(tools);
    expect(result).toMatch(/^- \*\*get_resume\*\*/m);
  });

  it('includes package metadata when provided', () => {
    const tools = [makeTool('get_resume', 'Retrieve resume information')];
    const packages = [makePackage({
      tools,
      name: 'resume',
      intent: ['resume'],
      sideEffects: false,
    })];
    const result = deriveCapabilities(tools, packages);
    expect(result).toContain('read-only');
  });

  it('marks side-effect tools', () => {
    const tools = [makeTool('create_draft', 'Create a blog draft')];
    const packages = [makePackage({
      tools,
      name: 'blog-writer',
      intent: ['blog'],
      sideEffects: true,
    })];
    const result = deriveCapabilities(tools, packages);
    expect(result).toContain('modifies state');
  });

  it('marks auth-required packages', () => {
    const tools = [makeTool('create_draft', 'Create a blog draft')];
    const packages = [makePackage({
      tools,
      name: 'blog-writer',
      intent: ['blog'],
      sideEffects: true,
      authRequired: true,
    })];
    const result = deriveCapabilities(tools, packages);
    expect(result).toContain('auth required');
  });
});

// ---------------------------------------------------------------------------
// dp-02: deriveBoundaries
// ---------------------------------------------------------------------------

describe('deriveBoundaries', () => {
  it('returns empty string when allowlist equals all tools', () => {
    const all = ['get_resume', 'list_posts'];
    expect(deriveBoundaries(all, all)).toBe('');
  });

  it('returns empty string when allToolNames is empty', () => {
    expect(deriveBoundaries([], [])).toBe('');
  });

  it('lists excluded tool names', () => {
    const allowlist = ['get_resume'];
    const allToolNames = ['get_resume', 'create_draft', 'delete_post'];
    const result = deriveBoundaries(allowlist, allToolNames);
    expect(result).toContain('create_draft');
    expect(result).toContain('delete_post');
    expect(result).not.toContain('get_resume');
  });

  it('uses a "you do not have" framing', () => {
    const result = deriveBoundaries(['a'], ['a', 'b']);
    expect(result.toLowerCase()).toMatch(/do not have/);
  });
});

// ---------------------------------------------------------------------------
// dp-03: buildSystemPrompt
// ---------------------------------------------------------------------------

describe('buildSystemPrompt', () => {
  it('includes base prompt', () => {
    const result = buildSystemPrompt({ domainKnowledge: 'You help with resumes.' });
    expect(result).toContain('Loop Commons');
    expect(result).toContain('amygdala');
  });

  it('includes domain knowledge section', () => {
    const result = buildSystemPrompt({ domainKnowledge: 'You help visitors explore blog posts.' });
    expect(result).toContain('You help visitors explore blog posts.');
  });

  it('includes derived capabilities when tools provided', () => {
    const tools = [makeTool('get_resume', 'Retrieve resume information')];
    const result = buildSystemPrompt({ domainKnowledge: 'Resume helper.', tools });
    expect(result).toContain('get_resume');
    expect(result).toContain('Retrieve resume information');
  });

  it('includes derived boundaries when allowlist is a subset', () => {
    const tools = [makeTool('get_resume', 'Retrieve resume information')];
    const result = buildSystemPrompt({
      domainKnowledge: 'Resume helper.',
      tools,
      allowlist: ['get_resume'],
      allToolNames: ['get_resume', 'create_draft', 'delete_post'],
    });
    expect(result).toContain('create_draft');
    expect(result).toContain('delete_post');
  });

  it('omits boundaries section when all tools are allowed', () => {
    const tools = [makeTool('get_resume', 'Retrieve resume info')];
    const result = buildSystemPrompt({
      domainKnowledge: 'Resume helper.',
      tools,
      allowlist: ['get_resume'],
      allToolNames: ['get_resume'],
    });
    // No "do not have" section
    expect(result.toLowerCase()).not.toMatch(/do not have/);
  });

  it('includes annotations when provided', () => {
    const result = buildSystemPrompt({
      domainKnowledge: 'Test.',
      annotations: [
        { key: 'returning_user', value: 'true' },
      ],
    });
    expect(result).toContain('returning_user');
    expect(result).toContain('true');
  });

  it('omits annotations section when empty', () => {
    const result = buildSystemPrompt({
      domainKnowledge: 'Test.',
      annotations: [],
    });
    expect(result).not.toContain('Context Annotations');
  });

  it('omits capabilities section when no tools', () => {
    const result = buildSystemPrompt({ domainKnowledge: 'Security discussion.' });
    expect(result).not.toContain('## Your Tools');
  });

  it('includes package metadata in capabilities', () => {
    const tools = [makeTool('get_resume', 'Retrieve resume information')];
    const packages = [makePackage({ tools, name: 'resume', sideEffects: false })];
    const result = buildSystemPrompt({
      domainKnowledge: 'Resume helper.',
      tools,
      packages,
    });
    expect(result).toContain('read-only');
  });

  it('includes memory metadata section when package has persistence field', () => {
    const tools = [makeTool('memory_recall', 'Recall memories')];
    const packages: ToolPackage[] = [{
      tools,
      formatContext: () => '',
      metadata: {
        name: 'keyword-memory',
        capabilities: ['recall', 'remember'],
        intent: ['memory'],
        sideEffects: true,
        persistence: true,
        scope: 'private',
        consolidation: true,
      },
    }];
    const result = buildSystemPrompt({
      domainKnowledge: 'Conversational agent.',
      tools,
      packages,
    });
    expect(result).toContain('Memory');
    expect(result).toContain('persistent');
  });

  it('derives "no persistent memory" for NullMemory metadata', () => {
    const packages: ToolPackage[] = [{
      tools: [],
      formatContext: () => '',
      metadata: {
        name: 'null-memory',
        capabilities: [],
        intent: ['memory'],
        sideEffects: false,
        persistence: false,
        scope: 'private',
        consolidation: false,
      },
    }];
    const result = buildSystemPrompt({
      domainKnowledge: 'Security subagent.',
      tools: [],
      packages,
    });
    expect(result).toContain('no persistent memory');
  });
});
