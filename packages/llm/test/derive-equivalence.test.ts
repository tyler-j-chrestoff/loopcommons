import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../src/tool/derive';
import type { ToolDefinition, ToolPackage } from '../src/tool';
import { createSubagentRegistry } from '../src/subagent/registry';
import { z } from 'zod';

/**
 * dp-05: Prompt equivalence tests.
 *
 * Prove that derived prompts contain all capability information that was
 * previously hand-written in SubagentConfig.systemPrompt. The hand-written
 * prompts have been trimmed to domain knowledge only — these tests verify
 * no information was lost.
 */

// ---------------------------------------------------------------------------
// Tool fixtures (mirror what route.ts assembles)
// ---------------------------------------------------------------------------

function makeTool(name: string, description: string): ToolDefinition {
  return { name, description, parameters: z.object({}), execute: async () => '' };
}

const resumeTools = [makeTool('get_resume', "Retrieve information about Tyler's professional background")];
const projectTools = [makeTool('get_project', 'Get information about the Loop Commons project')];
const blogReaderTools = [
  makeTool('list_posts', 'List published blog posts'),
  makeTool('read_post', 'Read a specific blog post by slug'),
];
const blogWriterTools = [
  ...blogReaderTools,
  makeTool('create_draft', 'Create a new blog post draft'),
  makeTool('edit_post', 'Edit an existing blog post'),
  makeTool('publish_post', 'Publish a draft blog post'),
  makeTool('unpublish_post', 'Unpublish a published blog post'),
  makeTool('delete_post', 'Delete a blog post'),
  makeTool('list_drafts', 'List draft blog posts'),
];
const memoryTools = [
  makeTool('memory_recall', 'Recall information from persistent memory'),
  makeTool('memory_remember', 'Store information in persistent memory'),
];

const allToolNames = [
  'get_resume', 'get_project',
  'list_posts', 'read_post', 'create_draft', 'edit_post',
  'publish_post', 'unpublish_post', 'delete_post', 'list_drafts',
  'memory_recall', 'memory_remember',
];

function makePackage(name: string, tools: ToolDefinition[], opts: { sideEffects: boolean; authRequired?: boolean }): ToolPackage {
  return {
    tools,
    formatContext: () => '',
    metadata: {
      name,
      capabilities: tools.map(t => t.name),
      intent: [name],
      sideEffects: opts.sideEffects,
      authRequired: opts.authRequired,
    },
  };
}

const allPackages: ToolPackage[] = [
  makePackage('resume', resumeTools, { sideEffects: false }),
  makePackage('project', projectTools, { sideEffects: false }),
  makePackage('blog-reader', blogReaderTools, { sideEffects: false }),
  makePackage('blog-writer', blogWriterTools, { sideEffects: true, authRequired: true }),
  makePackage('memory', memoryTools, { sideEffects: true }),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const registry = createSubagentRegistry();

describe('prompt equivalence: resume subagent', () => {
  const config = registry.get('resume');
  const tools = [...resumeTools, ...memoryTools];

  it('contains get_resume tool description', () => {
    const prompt = buildSystemPrompt({
      domainKnowledge: config.systemPrompt,
      tools,
      packages: allPackages,
      allowlist: config.toolAllowlist,
      allToolNames,
    });
    expect(prompt).toContain('get_resume');
    expect(prompt).toContain("Tyler's professional background");
  });

  it('contains domain knowledge about presenting naturally', () => {
    const prompt = buildSystemPrompt({
      domainKnowledge: config.systemPrompt,
      tools,
      packages: allPackages,
      allowlist: config.toolAllowlist,
      allToolNames,
    });
    expect(prompt).toContain('naturally and conversationally');
  });

  it('lists excluded tools as boundaries', () => {
    const prompt = buildSystemPrompt({
      domainKnowledge: config.systemPrompt,
      tools,
      packages: allPackages,
      allowlist: config.toolAllowlist,
      allToolNames,
    });
    expect(prompt).toContain('create_draft');
    expect(prompt).toContain('delete_post');
  });
});

describe('prompt equivalence: blog-reader subagent', () => {
  const config = registry.get('blog');

  it('contains read tool descriptions', () => {
    const tools = [...blogReaderTools, ...memoryTools];
    const prompt = buildSystemPrompt({
      domainKnowledge: config.systemPrompt,
      tools,
      packages: allPackages,
      allowlist: config.toolAllowlist,
      allToolNames,
    });
    expect(prompt).toContain('list_posts');
    expect(prompt).toContain('read_post');
  });

  it('excludes write tools via boundaries', () => {
    const tools = [...blogReaderTools, ...memoryTools];
    const prompt = buildSystemPrompt({
      domainKnowledge: config.systemPrompt,
      tools,
      packages: allPackages,
      allowlist: config.toolAllowlist,
      allToolNames,
    });
    expect(prompt).toContain('create_draft');
    expect(prompt).toContain('delete_post');
    expect(prompt).toContain('publish_post');
  });
});

describe('prompt equivalence: blog-writer subagent', () => {
  const config = registry.get('blog', { isAdmin: true });

  it('contains all write tool descriptions', () => {
    const tools = [...blogWriterTools, ...memoryTools];
    const prompt = buildSystemPrompt({
      domainKnowledge: config.systemPrompt,
      tools,
      packages: allPackages,
      allowlist: config.toolAllowlist,
      allToolNames,
    });
    expect(prompt).toContain('create_draft');
    expect(prompt).toContain('edit_post');
    expect(prompt).toContain('publish_post');
    expect(prompt).toContain('unpublish_post');
    expect(prompt).toContain('delete_post');
    expect(prompt).toContain('list_drafts');
  });

  it('marks write tools as modifying state', () => {
    const tools = [...blogWriterTools, ...memoryTools];
    const prompt = buildSystemPrompt({
      domainKnowledge: config.systemPrompt,
      tools,
      packages: allPackages,
      allowlist: config.toolAllowlist,
      allToolNames,
    });
    expect(prompt).toContain('modifies state');
    expect(prompt).toContain('auth required');
  });

  it('only excludes non-blog tools (resume, project)', () => {
    const tools = [...blogWriterTools, ...memoryTools];
    const prompt = buildSystemPrompt({
      domainKnowledge: config.systemPrompt,
      tools,
      packages: allPackages,
      allowlist: config.toolAllowlist,
      allToolNames,
    });
    // Blog writer has all blog + memory tools, but not resume/project
    expect(prompt).toContain('get_resume');
    expect(prompt).toContain('get_project');
    // None of the blog tools should be in the boundary list
    expect(prompt).not.toMatch(/do not have access to:.*create_draft/);
    expect(prompt).not.toMatch(/do not have access to:.*delete_post/);
  });
});

describe('prompt equivalence: security subagent', () => {
  const config = registry.get('security');

  it('has no tools section (security has no tools)', () => {
    const prompt = buildSystemPrompt({
      domainKnowledge: config.systemPrompt,
      allowlist: config.toolAllowlist,
      allToolNames,
    });
    expect(prompt).not.toContain('## Your Tools');
  });

  it('lists all tools as boundaries', () => {
    const prompt = buildSystemPrompt({
      domainKnowledge: config.systemPrompt,
      allowlist: config.toolAllowlist,
      allToolNames,
    });
    for (const name of allToolNames) {
      expect(prompt).toContain(name);
    }
  });

  it('preserves domain knowledge about transparency', () => {
    const prompt = buildSystemPrompt({
      domainKnowledge: config.systemPrompt,
      allowlist: config.toolAllowlist,
      allToolNames,
    });
    expect(prompt).toContain('defense-in-depth');
    expect(prompt).toContain('visible by design');
  });
});

describe('prompt equivalence: conversational subagent', () => {
  const config = registry.get('conversation');

  it('preserves Tyler background context', () => {
    const tools = [...memoryTools];
    const prompt = buildSystemPrompt({
      domainKnowledge: config.systemPrompt,
      tools,
      packages: allPackages,
      allowlist: config.toolAllowlist,
      allToolNames,
    });
    expect(prompt).toContain('Senior data engineer');
    expect(prompt).toContain('consciousness research');
  });

  it('preserves framing guidance', () => {
    const tools = [...memoryTools];
    const prompt = buildSystemPrompt({
      domainKnowledge: config.systemPrompt,
      tools,
      packages: allPackages,
      allowlist: config.toolAllowlist,
      allToolNames,
    });
    expect(prompt).toContain('Do NOT be self-deprecating');
    expect(prompt).toContain('research platform');
  });
});

describe('prompt equivalence: base prompt is always present', () => {
  const configs = registry.list().filter(c => c.id !== 'refusal');

  for (const config of configs) {
    it(`${config.id} subagent includes base prompt`, () => {
      const prompt = buildSystemPrompt({
        domainKnowledge: config.systemPrompt,
      });
      expect(prompt).toContain('Loop Commons');
      expect(prompt).toContain('amygdala');
      expect(prompt).toContain('Respond naturally and helpfully');
    });
  }
});
