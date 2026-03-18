import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createBlogTools } from '../src/tools/blog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let tools: ReturnType<typeof createBlogTools>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blog-tools-test-'));
  tools = createBlogTools({ dataDir: tmpDir });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function findTool(name: string) {
  return tools.find(t => t.name === name)!;
}

async function exec(name: string, args: Record<string, unknown> = {}) {
  const tool = findTool(name);
  const result = await tool.execute(args);
  return JSON.parse(result);
}

// Seed a draft for tests that need one
async function seedDraft(slug = 'test-post', title = 'Test Post', content = '# Test\n\nBody.', tags: string[] = ['ai']) {
  return exec('create_draft', { title, content, tags, slug });
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

describe('createBlogTools', () => {
  it('returns exactly 8 tools', () => {
    expect(tools.length).toBe(8);
  });

  it('returns tools with expected names', () => {
    const names = tools.map(t => t.name).sort();
    expect(names).toEqual([
      'create_draft',
      'delete_post',
      'edit_post',
      'list_drafts',
      'list_posts',
      'publish_post',
      'read_post',
      'unpublish_post',
    ]);
  });
});

// ---------------------------------------------------------------------------
// list_posts (published only)
// ---------------------------------------------------------------------------

describe('list_posts', () => {
  it('returns empty array when no published posts', async () => {
    const result = await exec('list_posts');
    expect(result.posts).toEqual([]);
  });

  it('returns only published posts', async () => {
    await seedDraft('draft-only');
    await seedDraft('will-publish');
    await exec('publish_post', { slug: 'will-publish' });

    const result = await exec('list_posts');
    expect(result.posts.length).toBe(1);
    expect(result.posts[0].slug).toBe('will-publish');
  });
});

// ---------------------------------------------------------------------------
// read_post
// ---------------------------------------------------------------------------

describe('read_post', () => {
  it('returns content for published slug', async () => {
    await seedDraft('readable');
    await exec('publish_post', { slug: 'readable' });

    const result = await exec('read_post', { slug: 'readable' });
    expect(result.post.slug).toBe('readable');
    expect(result.post.content).toContain('# Test');
  });

  it('returns content for draft slug', async () => {
    await seedDraft('draft-read');

    const result = await exec('read_post', { slug: 'draft-read' });
    expect(result.post.slug).toBe('draft-read');
  });

  it('returns error for nonexistent slug', async () => {
    const result = await exec('read_post', { slug: 'nope' });
    expect(result.error).toBeDefined();
  });

  it('returns error for invalid slug', async () => {
    const result = await exec('read_post', { slug: 'INVALID' });
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// create_draft
// ---------------------------------------------------------------------------

describe('create_draft', () => {
  it('creates a draft and returns it', async () => {
    const result = await exec('create_draft', {
      title: 'New Post',
      content: 'Hello world',
      tags: ['test'],
      slug: 'new-post',
    });
    expect(result.post.slug).toBe('new-post');
    expect(result.post.status).toBe('draft');
  });

  it('auto-generates slug from title if not provided', async () => {
    const result = await exec('create_draft', {
      title: 'My Great Post',
      content: 'Content here',
    });
    expect(result.post.slug).toBe('my-great-post');
  });
});

// ---------------------------------------------------------------------------
// edit_post
// ---------------------------------------------------------------------------

describe('edit_post', () => {
  it('updates content', async () => {
    await seedDraft('edit-me');
    const result = await exec('edit_post', { slug: 'edit-me', content: 'Updated content' });
    expect(result.post.content).toBe('Updated content');
  });

  it('returns error for nonexistent slug', async () => {
    const result = await exec('edit_post', { slug: 'nope', title: 'X' });
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// publish_post
// ---------------------------------------------------------------------------

describe('publish_post', () => {
  it('publishes a draft', async () => {
    await seedDraft('pub-me');
    const result = await exec('publish_post', { slug: 'pub-me' });
    expect(result.post.status).toBe('published');
    expect(result.post.publishedAt).toBeDefined();
  });

  it('returns error for already published', async () => {
    await seedDraft('already');
    await exec('publish_post', { slug: 'already' });
    const result = await exec('publish_post', { slug: 'already' });
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// unpublish_post
// ---------------------------------------------------------------------------

describe('unpublish_post', () => {
  it('unpublishes back to draft', async () => {
    await seedDraft('unpub-me');
    await exec('publish_post', { slug: 'unpub-me' });
    const result = await exec('unpublish_post', { slug: 'unpub-me' });
    expect(result.post.status).toBe('draft');
  });

  it('returns error for draft', async () => {
    await seedDraft('still-draft');
    const result = await exec('unpublish_post', { slug: 'still-draft' });
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// delete_post
// ---------------------------------------------------------------------------

describe('delete_post', () => {
  it('deletes a draft', async () => {
    await seedDraft('del-me');
    const result = await exec('delete_post', { slug: 'del-me' });
    expect(result.deleted).toBe(true);

    const read = await exec('read_post', { slug: 'del-me' });
    expect(read.error).toBeDefined();
  });

  it('returns error for nonexistent slug', async () => {
    const result = await exec('delete_post', { slug: 'nope' });
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// list_drafts
// ---------------------------------------------------------------------------

describe('list_drafts', () => {
  it('returns drafts only', async () => {
    await seedDraft('draft1');
    await seedDraft('draft2');
    await seedDraft('published-one');
    await exec('publish_post', { slug: 'published-one' });

    const result = await exec('list_drafts');
    expect(result.drafts.length).toBe(2);
    const slugs = result.drafts.map((d: any) => d.slug);
    expect(slugs).toContain('draft1');
    expect(slugs).toContain('draft2');
    expect(slugs).not.toContain('published-one');
  });
});
