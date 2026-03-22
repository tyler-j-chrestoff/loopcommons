'use client';

const TOOL_BG: Record<string, string> = {
  inspect: 'bg-cyan-100 text-cyan-700',
  act: 'bg-red-100 text-red-700',
  search: 'bg-yellow-100 text-yellow-700',
  model: 'bg-purple-100 text-purple-700',
};

type Agent = { id: string; tools: string[] };
type TaskResult = { encounterId: string; resolved: boolean; score: number; stepCount: number; died: boolean; costEstimate: number };
type Fitness = { agentId: string; fitnessScore: number; taskResults: TaskResult[] };

type DeathCandidate = {
  agentId: string;
  encounterId: string;
  score: number;
  stepCount: number;
  interestingness: number;
  tools: string[];
};

function findMostInterestingDeath(agents: Agent[], fitness: Fitness[]): DeathCandidate | null {
  const agentMap = new Map(agents.map(a => [a.id, a]));
  let best: DeathCandidate | null = null;

  for (const f of fitness) {
    for (const tr of f.taskResults ?? []) {
      if (!tr.died) continue;
      const interestingness = tr.stepCount * (1 - tr.score);
      const agent = agentMap.get(f.agentId);
      if (!agent) continue;

      if (!best || interestingness > best.interestingness) {
        best = {
          agentId: f.agentId,
          encounterId: tr.encounterId,
          score: tr.score,
          stepCount: tr.stepCount,
          interestingness,
          tools: agent.tools,
        };
      }
    }
  }

  return best;
}

function generateEpitaph(death: DeathCandidate): string {
  const toolStr = death.tools.join('+');
  if (death.stepCount >= 8 && death.score < 0.3) {
    return `[${toolStr}] fought hard through ${death.stepCount} steps before falling in ${death.encounterId}`;
  }
  if (death.score >= 0.5) {
    return `[${toolStr}] came close in ${death.encounterId} — scored ${death.score.toFixed(1)} but couldn't survive`;
  }
  return `[${toolStr}] met its end in ${death.encounterId} after ${death.stepCount} steps`;
}

export function FeaturedDeath({ agents, fitness }: { agents: Agent[]; fitness: Fitness[] }) {
  const death = findMostInterestingDeath(agents, fitness);
  if (!death) return null;

  return (
    <div className="border border-red-200 bg-red-50/50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">💀</span>
        <span className="text-sm font-semibold opacity-70">Featured Death</span>
      </div>
      <div className="flex gap-1 flex-wrap mb-2">
        {death.tools.map(t => (
          <span key={t} className={`px-1.5 py-0.5 rounded text-xs font-mono ${TOOL_BG[t] ?? 'bg-gray-100'}`}>
            {t}
          </span>
        ))}
      </div>
      <p className="text-sm opacity-80">{generateEpitaph(death)}</p>
      <div className="text-xs opacity-50 mt-1 font-mono">
        encounter: {death.encounterId} · score: {death.score.toFixed(2)} · steps: {death.stepCount}
      </div>
    </div>
  );
}
