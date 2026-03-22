import { ReplayPageContent } from '@/components/arena/ReplayPageContent';

type PageProps = {
  params: Promise<{ id: string; agentId: string; encounterId: string }>;
};

export default async function ReplayPage({ params }: PageProps) {
  const { id, agentId, encounterId } = await params;

  return (
    <ReplayPageContent
      tournamentId={id}
      agentId={agentId}
      encounterId={encounterId}
    />
  );
}
