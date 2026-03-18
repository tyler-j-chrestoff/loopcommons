import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import matter from 'gray-matter';
import { getPublishedPosts, getPost } from '../src/lib/blog/data';
import type { RenderedPost } from '../src/lib/blog/data';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function makeFrontmatter(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Test Post',
    slug: 'test-post',
    status: 'published',
    tags: ['ai'],
    createdAt: '2026-03-18T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z',
    publishedAt: '2026-03-18T00:00:00.000Z',
    ...overrides,
  };
}

async function writePost(
  dir: 'published' | 'drafts',
  slug: string,
  frontmatter: Record<string, unknown>,
  content: string,
) {
  const dirPath = path.join(tmpDir, dir);
  await fs.mkdir(dirPath, { recursive: true });
  const filePath = path.join(dirPath, `${slug}.md`);
  await fs.writeFile(filePath, matter.stringify(content, frontmatter), 'utf-8');
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blog-data-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// getPublishedPosts
// ---------------------------------------------------------------------------

describe('getPublishedPosts', () => {
  it('returns empty array when no posts exist', async () => {
    const posts = await getPublishedPosts(tmpDir);
    expect(posts).toEqual([]);
  });

  it('returns published posts sorted by publishedAt descending', async () => {
    await writePost('published', 'old-post', makeFrontmatter({
      title: 'Old Post',
      slug: 'old-post',
      publishedAt: '2026-03-01T00:00:00.000Z',
    }), 'Old content.');

    await writePost('published', 'new-post', makeFrontmatter({
      title: 'New Post',
      slug: 'new-post',
      publishedAt: '2026-03-18T00:00:00.000Z',
    }), 'New content.');

    const posts = await getPublishedPosts(tmpDir);
    expect(posts).toHaveLength(2);
    expect(posts[0].slug).toBe('new-post');
    expect(posts[1].slug).toBe('old-post');
  });

  it('returns summaries without content', async () => {
    await writePost('published', 'test-post', makeFrontmatter(), '# Hello\n\nBody.');

    const posts = await getPublishedPosts(tmpDir);
    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe('Test Post');
    expect(posts[0].tags).toEqual(['ai']);
    expect((posts[0] as any).content).toBeUndefined();
  });

  it('does not include drafts', async () => {
    await writePost('published', 'pub', makeFrontmatter({ slug: 'pub' }), 'Published.');
    await writePost('drafts', 'draft', makeFrontmatter({
      slug: 'draft',
      status: 'draft',
    }), 'Draft.');

    const posts = await getPublishedPosts(tmpDir);
    expect(posts).toHaveLength(1);
    expect(posts[0].slug).toBe('pub');
  });
});

// ---------------------------------------------------------------------------
// getPost
// ---------------------------------------------------------------------------

describe('getPost', () => {
  it('returns null for nonexistent slug', async () => {
    const result = await getPost('no-such-post', tmpDir);
    expect(result).toBeNull();
  });

  it('returns rendered HTML for a published post', async () => {
    await writePost('published', 'hello', makeFrontmatter({
      slug: 'hello',
      title: 'Hello World',
    }), '# Hello\n\nThis is **bold**.');

    const result = await getPost('hello', tmpDir);
    expect(result).not.toBeNull();
    expect(result!.frontmatter.title).toBe('Hello World');
    expect(result!.html).toContain('<h1');
    expect(result!.html).toContain('<strong>bold</strong>');
  });

  it('renders code blocks with syntax highlighting', async () => {
    await writePost('published', 'code', makeFrontmatter({
      slug: 'code',
    }), '```typescript\nconst x = 1;\n```');

    const result = await getPost('code', tmpDir);
    expect(result).not.toBeNull();
    expect(result!.html).toContain('data-language="typescript"');
  });
});
