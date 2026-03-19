import Link from 'next/link';
import { SeasonPicker } from '@/components/SeasonPicker';

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg font-[family-name:var(--font-prose)]">
      <nav className="border-b border-border bg-bg-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link
            href="/blog"
            className="text-lg font-bold text-text hover:text-accent transition-colors"
          >
            Loop Commons
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/blog"
              className="text-text-secondary hover:text-text transition-colors"
            >
              Blog
            </Link>
            <Link
              href="/"
              className="text-text-secondary hover:text-text transition-colors"
            >
              Chat
            </Link>
            <SeasonPicker />
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
