import { ReplayPageContent } from '@/components/arena/ReplayPageContent';

type PageProps = {
  params: Promise<{ tournamentId: string; agentId: string; encounterId: string }>;
};

export default async function ReplayPage({ params }: PageProps) {
  const { tournamentId, agentId, encounterId } = await params;

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-current/10 px-6 py-3 flex items-center gap-4">
        <a href="/" className="text-sm text-text-secondary hover:text-accent transition-colors">Chat</a>
        <a href="/blog" className="text-sm text-text-secondary hover:text-accent transition-colors">Blog</a>
        <a href="/arena" className="text-sm text-text-secondary hover:text-accent transition-colors">Arena</a>
        <span className="text-sm font-semibold">Replay</span>
      </header>
      <main className="max-w-4xl mx-auto py-6 px-4">
        <ReplayPageContent
          tournamentId={tournamentId}
          agentId={agentId}
          encounterId={encounterId}
        />
      </main>
    </div>
  );
}
