import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createBlogStore } from '../src/lib/blog/store';
import type { BlogStore } from '../src/lib/blog/store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let store: BlogStore;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blog-test-'));
  store = createBlogStore({ dataDir: tmpDir });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// createDraft
// ---------------------------------------------------------------------------

describe('createDraft', () => {
  it('creates a draft file with correct frontmatter', async () => {
    const post = await store.createDraft('hello-world', 'Hello World', '# Hello\n\nBody.', ['ai']);
    expect(post.slug).toBe('hello-world');
    expect(post.title).toBe('Hello World');
    expect(post.content).toBe('# Hello\n\nBody.');
    expect(post.status).toBe('draft');
    expect(post.tags).toEqual(['ai']);
    expect(post.createdAt).toBeDefined();
    expect(post.updatedAt).toBeDefined();
    expect(post.publishedAt).toBeUndefined();

    // Verify file exists on disk
    const filePath = path.join(tmpDir, 'drafts', 'hello-world.md');
    const stat = await fs.stat(filePath);
    expect(stat.isFile()).toBe(true);
  });

  it('rejects invalid slugs', async () => {
    await expect(store.createDraft('../etc/passwd', 'Hack', 'content')).rejects.toThrow();
    await expect(store.createDraft('foo/bar', 'Hack', 'content')).rejects.toThrow();
    await expect(store.createDraft('', 'Hack', 'content')).rejects.toThrow();
    await expect(store.createDraft('UPPER', 'Hack', 'content')).rejects.toThrow();
    await expect(store.createDraft('-leading', 'Hack', 'content')).rejects.toThrow();
  });

  it('rejects duplicate slug', async () => {
    await store.createDraft('test', 'Test', 'content');
    await expect(store.createDraft('test', 'Test 2', 'more content')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// readPost
// ---------------------------------------------------------------------------

describe('readPost', () => {
  it('reads a draft post', async () => {
    await store.createDraft('my-post', 'My Post', 'Content here', ['tag1']);
    const post = await store.readPost('my-post');
    expect(post).not.toBeNull();
    expect(post!.slug).toBe('my-post');
    expect(post!.title).toBe('My Post');
    expect(post!.content).toBe('Content here');
    expect(post!.status).toBe('draft');
    expect(post!.tags).toEqual(['tag1']);
  });

  it('reads a published post', async () => {
    await store.createDraft('pub-post', 'Published Post', 'Content');
    await store.publishPost('pub-post');
    const post = await store.readPost('pub-post');
    expect(post).not.toBeNull();
    expect(post!.status).toBe('published');
    expect(post!.publishedAt).toBeDefined();
  });

  it('returns null for nonexistent slug', async () => {
    const post = await store.readPost('does-not-exist');
    expect(post).toBeNull();
  });

  it('rejects invalid slugs', async () => {
    await expect(store.readPost('../hack')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// updatePost
// ---------------------------------------------------------------------------

describe('updatePost', () => {
  it('updates content and preserves createdAt', async () => {
    const original = await store.createDraft('update-me', 'Original', 'Old content');
    const originalCreatedAt = original.createdAt;

    // Ensure updatedAt differs from createdAt (ISO timestamps have ms resolution)
    await new Promise(r => setTimeout(r, 10));
    const updated = await store.updatePost('update-me', { content: 'New content' });
    expect(updated.content).toBe('New content');
    expect(updated.title).toBe('Original');
    expect(updated.createdAt).toBe(originalCreatedAt);
    expect(updated.updatedAt).not.toBe(original.updatedAt);
  });

  it('updates title and tags', async () => {
    await store.createDraft('update-me', 'Original', 'Content', ['old']);
    const updated = await store.updatePost('update-me', { title: 'New Title', tags: ['new'] });
    expect(updated.title).toBe('New Title');
    expect(updated.tags).toEqual(['new']);
  });

  it('throws for nonexistent slug', async () => {
    await expect(store.updatePost('nope', { title: 'X' })).rejects.toThrow();
  });

  it('can update a published post', async () => {
    await store.createDraft('pub', 'Pub', 'Content');
    await store.publishPost('pub');
    const updated = await store.updatePost('pub', { content: 'Updated content' });
    expect(updated.content).toBe('Updated content');
    expect(updated.status).toBe('published');
  });
});

// ---------------------------------------------------------------------------
// deletePost
// ---------------------------------------------------------------------------

describe('deletePost', () => {
  it('deletes a draft', async () => {
    await store.createDraft('delete-me', 'Delete Me', 'Content');
    await store.deletePost('delete-me');
    const post = await store.readPost('delete-me');
    expect(post).toBeNull();
  });

  it('deletes a published post', async () => {
    await store.createDraft('pub-delete', 'Pub Delete', 'Content');
    await store.publishPost('pub-delete');
    await store.deletePost('pub-delete');
    const post = await store.readPost('pub-delete');
    expect(post).toBeNull();
  });

  it('throws for nonexistent slug', async () => {
    await expect(store.deletePost('nope')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// publishPost
// ---------------------------------------------------------------------------

describe('publishPost', () => {
  it('moves draft to published and sets publishedAt', async () => {
    await store.createDraft('to-publish', 'Publish Me', 'Content');
    const published = await store.publishPost('to-publish');
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeDefined();

    // File should be in published dir, not drafts
    const pubPath = path.join(tmpDir, 'published', 'to-publish.md');
    const draftPath = path.join(tmpDir, 'drafts', 'to-publish.md');
    await expect(fs.stat(pubPath)).resolves.toBeDefined();
    await expect(fs.stat(draftPath)).rejects.toThrow();
  });

  it('throws for already-published post', async () => {
    await store.createDraft('already', 'Already', 'Content');
    await store.publishPost('already');
    await expect(store.publishPost('already')).rejects.toThrow();
  });

  it('throws for nonexistent slug', async () => {
    await expect(store.publishPost('nope')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// unpublishPost
// ---------------------------------------------------------------------------

describe('unpublishPost', () => {
  it('moves published back to draft', async () => {
    await store.createDraft('unpub', 'Unpub', 'Content');
    await store.publishPost('unpub');
    const draft = await store.unpublishPost('unpub');
    expect(draft.status).toBe('draft');

    // File should be in drafts, not published
    const draftPath = path.join(tmpDir, 'drafts', 'unpub.md');
    const pubPath = path.join(tmpDir, 'published', 'unpub.md');
    await expect(fs.stat(draftPath)).resolves.toBeDefined();
    await expect(fs.stat(pubPath)).rejects.toThrow();
  });

  it('throws for draft (not published)', async () => {
    await store.createDraft('still-draft', 'Draft', 'Content');
    await expect(store.unpublishPost('still-draft')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// listPublished
// ---------------------------------------------------------------------------

describe('listPublished', () => {
  it('returns published posts sorted by publishedAt desc', async () => {
    await store.createDraft('post-a', 'Post A', 'Content A');
    await store.createDraft('post-b', 'Post B', 'Content B');
    await store.publishPost('post-a');
    // Small delay to ensure different publishedAt
    await new Promise(r => setTimeout(r, 10));
    await store.publishPost('post-b');

    const list = await store.listPublished();
    expect(list.length).toBe(2);
    expect(list[0].slug).toBe('post-b'); // most recent first
    expect(list[1].slug).toBe('post-a');
    // Summaries should not have content
    expect((list[0] as any).content).toBeUndefined();
  });

  it('returns empty array when no published posts', async () => {
    await store.createDraft('draft-only', 'Draft', 'Content');
    const list = await store.listPublished();
    expect(list).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// listDrafts
// ---------------------------------------------------------------------------

describe('listDrafts', () => {
  it('returns drafts sorted by updatedAt desc', async () => {
    await store.createDraft('draft-a', 'Draft A', 'Content A');
    await new Promise(r => setTimeout(r, 10));
    await store.createDraft('draft-b', 'Draft B', 'Content B');

    const list = await store.listDrafts();
    expect(list.length).toBe(2);
    expect(list[0].slug).toBe('draft-b'); // most recent first
    expect(list[1].slug).toBe('draft-a');
    expect((list[0] as any).content).toBeUndefined();
  });

  it('does not include published posts', async () => {
    await store.createDraft('draft', 'Draft', 'Content');
    await store.createDraft('pub', 'Published', 'Content');
    await store.publishPost('pub');

    const list = await store.listDrafts();
    expect(list.length).toBe(1);
    expect(list[0].slug).toBe('draft');
  });
});

// ---------------------------------------------------------------------------
// Path traversal defense
// ---------------------------------------------------------------------------

describe('path traversal prevention', () => {
  it('blocks traversal in all operations', async () => {
    const badSlugs = ['../etc/passwd', 'foo/bar', '..', '.', 'a/../b'];
    for (const slug of badSlugs) {
      await expect(store.createDraft(slug, 'X', 'X')).rejects.toThrow();
      await expect(store.readPost(slug)).rejects.toThrow();
      await expect(store.updatePost(slug, { title: 'X' })).rejects.toThrow();
      await expect(store.deletePost(slug)).rejects.toThrow();
      await expect(store.publishPost(slug)).rejects.toThrow();
      await expect(store.unpublishPost(slug)).rejects.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// BLOG_DATA_DIR override
// ---------------------------------------------------------------------------

describe('BLOG_DATA_DIR override', () => {
  it('uses custom data directory', async () => {
    const customDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blog-custom-'));
    const customStore = createBlogStore({ dataDir: customDir });

    await customStore.createDraft('custom', 'Custom', 'Content');
    const filePath = path.join(customDir, 'drafts', 'custom.md');
    const stat = await fs.stat(filePath);
    expect(stat.isFile()).toBe(true);

    await fs.rm(customDir, { recursive: true, force: true });
  });
});
