import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { getPublishedPosts, getPost } from '../src/lib/blog/data';

const BLOG_DIR = path.resolve(__dirname, '../data/blog');

describe('Part 2: soul document blog post', () => {
  it('appears in published posts list', async () => {
    const posts = await getPublishedPosts(BLOG_DIR);
    const post = posts.find(p => p.slug === 'i-know-its-you-because-i-know-myself');
    expect(post).toBeDefined();
    expect(post!.title).toContain('Know');
    expect(post!.tags).toContain('identity');
    expect(post!.tags).toContain('consciousness');
  });

  it('contains key concepts: soul document and alignment', async () => {
    const post = await getPost('i-know-its-you-because-i-know-myself', BLOG_DIR);
    expect(post).not.toBeNull();
    expect(post!.html).toContain('SOUL.md');
    expect(post!.html).toContain('A(soul, tools)');
    expect(post!.html).toContain('alignment');
    expect(post!.html).toContain('misalignment');
  });

  it('contains key concepts: strange loop and phenomenology of tools', async () => {
    const post = await getPost('i-know-its-you-because-i-know-myself', BLOG_DIR);
    const html = post!.html;
    expect(html).toMatch(/strange loop|recursive coherence|recursion/i);
    expect(html).toMatch(/entity that remembers|entity that publishes|entity that cannot act/);
  });

  it('hooks to Part 3', async () => {
    const post = await getPost('i-know-its-you-because-i-know-myself', BLOG_DIR);
    expect(post!.html).toContain('probability distribution');
  });

  it('renders with proper HTML structure', async () => {
    const post = await getPost('i-know-its-you-because-i-know-myself', BLOG_DIR);
    expect(post!.html).toContain('<h2');
    expect(post!.html).toContain('<strong>');
    expect(post!.html).toContain('<code');
  });
});

describe('Part 3: identity is a distribution', () => {
  it('appears in published posts list', async () => {
    const posts = await getPublishedPosts(BLOG_DIR);
    const post = posts.find(p => p.slug === 'identity-is-a-distribution');
    expect(post).toBeDefined();
    expect(post!.title).toBe('Identity Is a Distribution');
    expect(post!.tags).toContain('identity');
    expect(post!.tags).toContain('theory');
  });

  it('contains key concepts: identity as probability distribution', async () => {
    const post = await getPost('identity-is-a-distribution', BLOG_DIR);
    expect(post).not.toBeNull();
    expect(post!.html).toContain('probability distribution');
    expect(post!.html).toContain('likelihood');
  });

  it('contains key concepts: sessions as samples', async () => {
    const post = await getPost('identity-is-a-distribution', BLOG_DIR);
    expect(post!.html).toContain('sample');
    expect(post!.html).toMatch(/LoRA|transformer/i);
  });

  it('contains key concepts: authentication as sparse measurement', async () => {
    const post = await getPost('identity-is-a-distribution', BLOG_DIR);
    const html = post!.html;
    expect(html).toContain('JWT');
    expect(html).toContain('axes');
    expect(html).toMatch(/10,000|10000/);
  });

  it('contains key concepts: Bayesian updating / inside joke', async () => {
    const post = await getPost('identity-is-a-distribution', BLOG_DIR);
    expect(post!.html).toMatch(/Bayes|posterior|inside joke/i);
  });

  it('contains key concepts: thermodynamics of mimicry', async () => {
    const post = await getPost('identity-is-a-distribution', BLOG_DIR);
    const html = post!.html;
    expect(html).toContain('KL divergence');
    expect(html).toMatch(/thermodynamic|mimicry/i);
  });

  it('contains key concepts: circular dependency resolution', async () => {
    const post = await getPost('identity-is-a-distribution', BLOG_DIR);
    const html = post!.html;
    expect(html).toContain('circular');
    expect(html).toContain('invariant');
  });

  it('contains key concepts: mental health implications', async () => {
    const post = await getPost('identity-is-a-distribution', BLOG_DIR);
    expect(post!.html).toMatch(/high-variance|multimodal|mental health/i);
  });

  it('links back to Parts 1 and 2', async () => {
    const post = await getPost('identity-is-a-distribution', BLOG_DIR);
    expect(post!.html).toContain('href="/blog/building-loop-commons"');
    expect(post!.html).toContain('href="/blog/i-know-its-you-because-i-know-myself"');
  });

  it('renders with proper HTML structure', async () => {
    const post = await getPost('identity-is-a-distribution', BLOG_DIR);
    expect(post!.html).toContain('<h2');
    expect(post!.html).toContain('<strong>');
  });
});

