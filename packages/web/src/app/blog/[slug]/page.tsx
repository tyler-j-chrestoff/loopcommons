import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPost } from '@/lib/blog/data';
import type { Metadata } from 'next';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: 'Not Found — Loop Commons' };

  return {
    title: `${post.frontmatter.title} — Loop Commons`,
    description: post.frontmatter.excerpt ?? `${post.frontmatter.title} by Tyler Chrestoff`,
    openGraph: {
      title: post.frontmatter.title,
      description: post.frontmatter.excerpt ?? `${post.frontmatter.title} by Tyler Chrestoff`,
      type: 'article',
      publishedTime: post.frontmatter.publishedAt,
      tags: post.frontmatter.tags,
    },
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    notFound();
  }

  const { frontmatter, html } = post;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href="/blog"
        className="mb-6 inline-block text-sm text-text-muted hover:text-accent transition-colors"
      >
        &larr; Back to blog
      </Link>

      <article>
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-text">{frontmatter.title}</h1>
          <div className="mt-2 text-sm text-text-muted">
            {frontmatter.author === 'agent'
              ? 'Written by the Loop Commons agent'
              : 'Written by Tyler Chrestoff'}
            {' · '}
            {formatDate(frontmatter.publishedAt ?? frontmatter.updatedAt)}
          </div>
          {frontmatter.tags && frontmatter.tags.length > 0 && (
            <div className="mt-3 flex gap-2">
              {frontmatter.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-bg-elevated px-2 py-0.5 text-xs text-text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        <div
          className="blog-prose"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
    </main>
  );
}
