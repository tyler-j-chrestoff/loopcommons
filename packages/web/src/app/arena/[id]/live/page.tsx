import TournamentLiveClient from './TournamentLiveClient';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function LiveTournamentPage({ params }: PageProps) {
  const { id } = await params;
  return <TournamentLiveClient tournamentId={id} />;
}
