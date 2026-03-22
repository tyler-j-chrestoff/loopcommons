export default function ArenaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-current/10 px-6 py-3 flex items-center gap-4">
        <a href="/" className="text-sm text-text-secondary hover:text-accent transition-colors">Chat</a>
        <a href="/blog" className="text-sm text-text-secondary hover:text-accent transition-colors">Blog</a>
        <a href="/arena" className="text-sm font-semibold">Arena</a>
      </header>
      <main className="max-w-4xl mx-auto py-6 px-4">
        {children}
      </main>
    </div>
  );
}
