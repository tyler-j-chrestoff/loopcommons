import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { getPublishedPosts, getPost } from '../src/lib/blog/data';

const BLOG_DIR = path.resolve(__dirname, '../data/blog');

describe('inaugural blog post', () => {
  it('appears in published posts list', async () => {
    const posts = await getPublishedPosts(BLOG_DIR);
    expect(posts.length).toBeGreaterThanOrEqual(1);
    const post = posts.find(p => p.slug === 'building-loop-commons');
    expect(post).toBeDefined();
    expect(post!.title).toContain('Loop Commons');
    expect(post!.tags).toContain('consciousness');
    expect(post!.tags).toContain('security');
    expect(post!.excerpt).toContain('prompt injection');
  });

  it('renders full post with syntax-highlighted code and prose', async () => {
    const post = await getPost('building-loop-commons', BLOG_DIR);
    expect(post).not.toBeNull();
    expect(post!.frontmatter.title).toContain('Loop Commons');
    expect(post!.html).toContain('<h2');
    expect(post!.html).toContain('The Amygdala Layer');
    expect(post!.html).toContain('<strong>');
    expect(post!.html).toContain('href="https://github.com/tyler-j-chrestoff/loopcommons"');
  });
});
