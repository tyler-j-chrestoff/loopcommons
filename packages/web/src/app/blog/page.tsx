import Link from 'next/link';
import { getPublishedPosts } from '@/lib/blog/data';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog — Loop Commons',
  description: "Tyler's research and engineering writing.",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function BlogPage() {
  const posts = await getPublishedPosts();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold text-text">Blog</h1>

      {posts.length === 0 ? (
        <p className="text-text-muted">No posts yet.</p>
      ) : (
        <ul className="space-y-8">
          {posts.map((post) => (
            <li key={post.slug} className="border-b border-border-subtle pb-6">
              <Link
                href={`/blog/${post.slug}`}
                className="text-lg font-semibold text-accent hover:text-accent-hover transition-colors"
              >
                {post.title}
              </Link>
              <div className="mt-1 text-sm text-text-muted">
                {post.author === 'agent'
                  ? 'By the Loop Commons agent'
                  : 'By Tyler Chrestoff'}
                {' · '}
                {formatDate(post.publishedAt ?? post.updatedAt)}
              </div>
              {post.excerpt && (
                <p className="mt-2 text-text-secondary">{post.excerpt}</p>
              )}
              {post.tags.length > 0 && (
                <div className="mt-2 flex gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-bg-elevated px-2 py-0.5 text-xs text-text-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
