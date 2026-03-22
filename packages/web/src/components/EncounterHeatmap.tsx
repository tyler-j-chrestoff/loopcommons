'use client';

const TOOL_COLORS: Record<string, string> = {
  inspect: 'text-cyan-600',
  act: 'text-red-600',
  search: 'text-yellow-600',
  model: 'text-purple-600',
};

function scoreColor(score: number): string {
  if (score >= 0.8) return 'bg-emerald-200 text-emerald-900';
  if (score >= 0.4) return 'bg-yellow-200 text-yellow-900';
  if (score > 0) return 'bg-orange-200 text-orange-900';
  return 'bg-red-100 text-red-800';
}

type Agent = { id: string; tools: string[] };
type TaskResult = { encounterId: string; resolved: boolean; score: number; stepCount: number; died: boolean; costEstimate: number };
type Fitness = { agentId: string; fitnessScore: number; taskResults: TaskResult[] };

export function EncounterHeatmap({
  agents,
  fitness,
  onCellClick,
}: {
  agents: Agent[];
  fitness: Fitness[];
  onCellClick?: (agentId: string, encounterId: string) => void;
}) {
  if (agents.length === 0 || fitness.length === 0) {
    return <div className="text-xs opacity-40 text-center py-4">No encounters to display</div>;
  }

  const fitnessMap = new Map(fitness.map(f => [f.agentId, f]));
  const encounterIds = fitness[0]?.taskResults.map(tr => tr.encounterId) ?? [];

  const sorted = [...agents].sort((a, b) =>
    (fitnessMap.get(b.id)?.fitnessScore ?? 0) - (fitnessMap.get(a.id)?.fitnessScore ?? 0),
  );

  return (
    <div className="overflow-x-auto">
      <table className="text-xs font-mono w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left p-1.5 border-b border-current/10 sticky left-0 bg-bg">Agent</th>
            {encounterIds.map(eid => (
              <th key={eid} className="p-1.5 border-b border-current/10 text-center min-w-[3rem]">
                {eid.toUpperCase()}
              </th>
            ))}
            <th className="p-1.5 border-b border-current/10 text-center font-bold">Fit</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(agent => {
            const f = fitnessMap.get(agent.id);
            return (
              <tr key={agent.id}>
                <td className="p-1.5 border-b border-current/5 sticky left-0 bg-bg">
                  <div className="flex gap-0.5">
                    {agent.tools.map(t => (
                      <span key={t} className={`${TOOL_COLORS[t] ?? ''}`}>{t[0]}</span>
                    ))}
                  </div>
                </td>
                {encounterIds.map(eid => {
                  const tr = f?.taskResults.find(t => t.encounterId === eid);
                  const score = tr?.score ?? 0;
                  const died = tr?.died ?? false;
                  return (
                    <td
                      key={eid}
                      className={`p-1.5 border-b border-current/5 text-center ${scoreColor(score)} ${onCellClick ? 'cursor-pointer hover:opacity-80' : ''}`}
                      onClick={onCellClick ? () => onCellClick(agent.id, eid) : undefined}
                    >
                      {died ? '💀' : score.toFixed(1)}
                    </td>
                  );
                })}
                <td className="p-1.5 border-b border-current/5 text-center font-bold">
                  {(f?.fitnessScore ?? 0).toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
