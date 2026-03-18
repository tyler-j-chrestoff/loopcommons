import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock blog data layer
// ---------------------------------------------------------------------------

const mockGetPublishedPosts = vi.fn();
const mockGetPost = vi.fn();

vi.mock('../src/lib/blog/data', () => ({
  getPublishedPosts: (...args: unknown[]) => mockGetPublishedPosts(...args),
  getPost: (...args: unknown[]) => mockGetPost(...args),
}));

// Mock next/navigation (notFound throws)
const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

import { render, screen, cleanup } from '@testing-library/react';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// /blog listing page
// ---------------------------------------------------------------------------

describe('/blog listing page', () => {
  it('renders post list from data', async () => {
    mockGetPublishedPosts.mockResolvedValue([
      {
        slug: 'first-post',
        title: 'First Post',
        status: 'published',
        tags: ['ai', 'research'],
        createdAt: '2026-03-18T00:00:00.000Z',
        updatedAt: '2026-03-18T00:00:00.000Z',
        publishedAt: '2026-03-18T00:00:00.000Z',
        excerpt: 'A first post excerpt.',
      },
      {
        slug: 'second-post',
        title: 'Second Post',
        status: 'published',
        tags: ['engineering'],
        createdAt: '2026-03-17T00:00:00.000Z',
        updatedAt: '2026-03-17T00:00:00.000Z',
        publishedAt: '2026-03-17T00:00:00.000Z',
      },
    ]);

    const { default: BlogPage } = await import('../src/app/blog/page');
    const result = await BlogPage();
    render(result);

    expect(screen.getByText('First Post')).toBeDefined();
    expect(screen.getByText('Second Post')).toBeDefined();
    expect(screen.getByText('A first post excerpt.')).toBeDefined();
    expect(screen.getByText('ai')).toBeDefined();
    expect(screen.getByText('research')).toBeDefined();
  });

  it('shows empty state when no posts', async () => {
    mockGetPublishedPosts.mockResolvedValue([]);

    const { default: BlogPage } = await import('../src/app/blog/page');
    const result = await BlogPage();
    render(result);

    expect(screen.getByText('No posts yet.')).toBeDefined();
  });

  it('renders post titles as links to /blog/[slug]', async () => {
    mockGetPublishedPosts.mockResolvedValue([
      {
        slug: 'my-post',
        title: 'My Post',
        status: 'published',
        tags: [],
        createdAt: '2026-03-18T00:00:00.000Z',
        updatedAt: '2026-03-18T00:00:00.000Z',
        publishedAt: '2026-03-18T00:00:00.000Z',
      },
    ]);

    const { default: BlogPage } = await import('../src/app/blog/page');
    const result = await BlogPage();
    render(result);

    const link = screen.getByRole('link', { name: 'My Post' });
    expect(link.getAttribute('href')).toBe('/blog/my-post');
  });

  it('formats dates', async () => {
    mockGetPublishedPosts.mockResolvedValue([
      {
        slug: 'dated',
        title: 'Dated Post',
        status: 'published',
        tags: [],
        createdAt: '2026-03-18T00:00:00.000Z',
        updatedAt: '2026-03-18T00:00:00.000Z',
        publishedAt: '2026-03-18T00:00:00.000Z',
      },
    ]);

    const { default: BlogPage } = await import('../src/app/blog/page');
    const result = await BlogPage();
    render(result);

    // Should render a human-readable date
    expect(screen.getAllByText(/Mar.*18.*2026/).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// /blog/[slug] post page
// ---------------------------------------------------------------------------

describe('/blog/[slug] post page', () => {
  it('renders post HTML content', async () => {
    mockGetPost.mockResolvedValue({
      frontmatter: {
        title: 'Hello World',
        slug: 'hello-world',
        status: 'published',
        tags: ['ai'],
        createdAt: '2026-03-18T00:00:00.000Z',
        updatedAt: '2026-03-18T00:00:00.000Z',
        publishedAt: '2026-03-18T00:00:00.000Z',
      },
      html: '<h1>Hello</h1><p>This is <strong>bold</strong>.</p>',
    });

    const { default: PostPage } = await import('../src/app/blog/[slug]/page');
    const result = await PostPage({ params: Promise.resolve({ slug: 'hello-world' }) });
    render(result);

    expect(screen.getByText('Hello World')).toBeDefined();
    expect(screen.getByText('ai')).toBeDefined();
    // HTML rendered via dangerouslySetInnerHTML
    expect(screen.getByText('bold')).toBeDefined();
  });

  it('calls notFound for nonexistent slug', async () => {
    mockGetPost.mockResolvedValue(null);

    const { default: PostPage } = await import('../src/app/blog/[slug]/page');

    await expect(
      PostPage({ params: Promise.resolve({ slug: 'no-such-post' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockNotFound).toHaveBeenCalled();
  });

  it('renders a back link to /blog', async () => {
    mockGetPost.mockResolvedValue({
      frontmatter: {
        title: 'Test',
        slug: 'test',
        status: 'published',
        tags: [],
        createdAt: '2026-03-18T00:00:00.000Z',
        updatedAt: '2026-03-18T00:00:00.000Z',
        publishedAt: '2026-03-18T00:00:00.000Z',
      },
      html: '<p>Content</p>',
    });

    const { default: PostPage } = await import('../src/app/blog/[slug]/page');
    const result = await PostPage({ params: Promise.resolve({ slug: 'test' }) });
    render(result);

    const backLink = screen.getByRole('link', { name: /back|blog/i });
    expect(backLink.getAttribute('href')).toBe('/blog');
  });

  it('renders post date', async () => {
    mockGetPost.mockResolvedValue({
      frontmatter: {
        title: 'Dated',
        slug: 'dated',
        status: 'published',
        tags: [],
        createdAt: '2026-03-18T00:00:00.000Z',
        updatedAt: '2026-03-18T00:00:00.000Z',
        publishedAt: '2026-03-18T00:00:00.000Z',
      },
      html: '<p>Content</p>',
    });

    const { default: PostPage } = await import('../src/app/blog/[slug]/page');
    const result = await PostPage({ params: Promise.resolve({ slug: 'dated' }) });
    render(result);

    expect(screen.getAllByText(/Mar.*18.*2026/).length).toBeGreaterThan(0);
  });
});
