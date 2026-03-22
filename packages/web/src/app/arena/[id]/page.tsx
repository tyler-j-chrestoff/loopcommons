import TournamentDetailClient from './TournamentDetailClient';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function TournamentPage({ params }: PageProps) {
  const { id } = await params;
  return <TournamentDetailClient tournamentId={id} />;
}
