/**
 * Blog data types and validation schemas.
 *
 * blog-02: Types for the file-based blog storage module.
 * Posts are markdown files with YAML frontmatter, stored in drafts/ and published/ directories.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Slug validation
// ---------------------------------------------------------------------------

/** Regex for valid blog slugs: lowercase alphanumeric + hyphens, no leading/trailing/consecutive hyphens. */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// Frontmatter schema (Zod — for parsing gray-matter output)
// ---------------------------------------------------------------------------

export const BlogFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().regex(SLUG_REGEX),
  status: z.enum(['draft', 'published']),
  author: z.enum(['tyler', 'agent']).optional(),
  tags: z.array(z.string()).optional(),
  excerpt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().optional(),
});

export type BlogFrontmatter = z.infer<typeof BlogFrontmatterSchema>;

// ---------------------------------------------------------------------------
// Blog post types
// ---------------------------------------------------------------------------

/** Full blog post — includes markdown content. */
export type BlogPost = {
  slug: string;
  title: string;
  content: string;
  status: 'draft' | 'published';
  author?: 'tyler' | 'agent';
  tags: string[];
  createdAt: string;
  updatedAt: string;
  excerpt?: string;
  publishedAt?: string;
};

/** Blog post summary — for list operations (no content). */
export type BlogPostSummary = {
  slug: string;
  title: string;
  status: 'draft' | 'published';
  author?: 'tyler' | 'agent';
  tags: string[];
  createdAt: string;
  updatedAt: string;
  excerpt?: string;
  publishedAt?: string;
};
