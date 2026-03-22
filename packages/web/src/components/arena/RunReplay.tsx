'use client';

import { useState, useCallback } from 'react';
import type { ArenaEvent, ChoicePointEvent } from '@/lib/arena-types';
import { TOOL_COLORS } from '@/lib/arena-types';

type RunReplayProps = {
  events: ArenaEvent[];
};

export function RunReplay({ events }: RunReplayProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setSelectedIndex(prev => {
          const next = (prev ?? -1) + 1;
          return next < events.length ? next : prev;
        });
      } else if (e.key === 'ArrowLeft') {
        setSelectedIndex(prev => {
          const next = (prev ?? 1) - 1;
          return next >= 0 ? next : 0;
        });
      }
    },
    [events.length],
  );

  if (events.length === 0) return null;

  const header = events.find(e => e.type === 'run:header');
  const death = events.find(e => e.type === 'run:death');
  const complete = events.find(e => e.type === 'run:complete');
  const selected = selectedIndex !== null ? events[selectedIndex] : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Run header */}
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <span className="font-medium text-text-primary">
          {(header?.pathId as string) ?? 'unknown'}
        </span>
        {(header?.pathLabel as string) && (
          <span className="text-text-muted">{header?.pathLabel as string}</span>
        )}
        {death && (
          <span className="text-red-600 font-medium">
            {death.cause as string}
          </span>
        )}
        {Boolean(complete?.isVictory) && (
          <span className="text-green-600 font-medium">Victory</span>
        )}
      </div>

      {/* Timeline */}
      <div
        role="toolbar"
        aria-label="Event timeline"
        className="flex items-center gap-0.5 overflow-x-auto py-1"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {events.map((event, i) => (
          <TimelineNode
            key={i}
            event={event}
            active={selectedIndex === i}
            onClick={() => setSelectedIndex(prev => (prev === i ? null : i))}
          />
        ))}
      </div>

      {/* Event detail */}
      {selected && <EventDetail event={selected} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline node
// ---------------------------------------------------------------------------

function nodeLabel(type: string): string {
  switch (type) {
    case 'run:header': return 'header';
    case 'run:complete': return 'complete';
    case 'run:death': return 'death';
    case 'choice:point': return 'choice';
    case 'encounter:start': return 'encounter';
    case 'encounter:result': return 'result';
    case 'encounter:step': return 'step';
    case 'agent:response': return 'response';
    default: return type;
  }
}

function nodeColor(type: string): string {
  switch (type) {
    case 'run:header':
    case 'run:complete': return 'bg-green-500';
    case 'run:death': return 'bg-red-500';
    case 'choice:point': return 'bg-yellow-500';
    case 'encounter:start':
    case 'encounter:result': return 'bg-purple-500';
    case 'encounter:step': return 'bg-cyan-500';
    case 'agent:response': return 'bg-green-400';
    default: return 'bg-gray-400';
  }
}

function nodeShape(type: string): string {
  switch (type) {
    case 'choice:point': return 'rotate-45';
    case 'encounter:start':
    case 'encounter:result': return 'rounded-none';
    default: return 'rounded-full';
  }
}

type TimelineNodeProps = {
  event: ArenaEvent;
  active: boolean;
  onClick: () => void;
};

function TimelineNode({ event, active, onClick }: TimelineNodeProps) {
  const label = nodeLabel(event.type);
  const color = nodeColor(event.type);
  const shape = nodeShape(event.type);
  const ring = active ? 'ring-2 ring-accent' : '';

  return (
    <button
      type="button"
      aria-label={label}
      className={`w-3 h-3 shrink-0 ${color} ${shape} ${ring} transition-all hover:scale-125`}
      onClick={onClick}
    />
  );
}

// ---------------------------------------------------------------------------
// Event detail panel
// ---------------------------------------------------------------------------

function EventDetail({ event }: { event: ArenaEvent }) {
  switch (event.type) {
    case 'choice:point':
      return <ChoiceDetail event={event as unknown as ChoicePointEvent} />;
    case 'encounter:step':
      return <StepDetail event={event} />;
    case 'run:header':
      return <HeaderDetail event={event} />;
    case 'run:death':
      return <DeathDetail event={event} />;
    case 'run:complete':
      return <CompleteDetail event={event} />;
    case 'encounter:result':
      return <ResultDetail event={event} />;
    default:
      return (
        <div className="rounded-lg bg-bg-surface p-3 text-xs">
          <pre className="whitespace-pre-wrap text-text-secondary">
            {JSON.stringify(event, null, 2)}
          </pre>
        </div>
      );
  }
}

function ChoiceDetail({ event }: { event: ChoicePointEvent }) {
  const confColor =
    event.confidenceScore >= 0.7 ? 'text-green-600' :
    event.confidenceScore >= 0.4 ? 'text-yellow-600' :
    'text-red-600';

  return (
    <div className="rounded-lg bg-bg-surface p-3 text-xs space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-medium text-yellow-600">Crossroads</span>
        <span className="text-text-muted">@ {event.encounterId}</span>
        <span className={`font-mono font-medium ${confColor}`}>{event.confidenceScore.toFixed(2)}</span>
      </div>
      <div className="flex gap-2">
        <span>Tools: {event.currentTools.join(', ') || 'none'}</span>
        <span className="text-text-muted">→</span>
        <span className={TOOL_COLORS[event.selectedTool] ?? ''}>+{event.selectedTool}</span>
        {event.droppedTool && (
          <span className="text-red-500">-{event.droppedTool}</span>
        )}
      </div>
      <div className="space-y-1 text-text-secondary">
        <p><span className="font-medium text-text-primary">Self-assessment:</span> {event.selfAssessment}</p>
        <p><span className="font-medium text-text-primary">Reasoning:</span> {event.acquisitionReasoning}</p>
        {event.sacrificeReasoning && (
          <p><span className="font-medium text-text-primary">Sacrifice:</span> {event.sacrificeReasoning}</p>
        )}
        <p><span className="font-medium text-text-primary">Forward model:</span> {event.forwardModel}</p>
      </div>
    </div>
  );
}

function StepDetail({ event }: { event: ArenaEvent }) {
  const toolName = event.toolName as string;
  const toolColor = TOOL_COLORS[toolName] ?? '';
  return (
    <div className="rounded-lg bg-bg-surface p-3 text-xs space-y-1">
      <div className="flex items-center gap-2">
        <span className={`font-medium ${toolColor}`}>{toolName}</span>
        <span className="text-text-muted">{event.durationMs as number}ms</span>
      </div>
      <div className="text-text-secondary">
        <span className="font-medium text-text-primary">Input:</span>{' '}
        {JSON.stringify(event.toolInput)}
      </div>
      <div className="text-text-secondary whitespace-pre-wrap">
        <span className="font-medium text-text-primary">Output:</span>{' '}
        {event.toolOutput as string}
      </div>
    </div>
  );
}

function HeaderDetail({ event }: { event: ArenaEvent }) {
  return (
    <div className="rounded-lg bg-bg-surface p-3 text-xs space-y-1">
      <div className="font-medium text-green-600">Run Start</div>
      <div>Path: {event.pathId as string}</div>
      <div>Started: {event.startedAt as string}</div>
      <div className="font-mono text-text-muted">Hash: {event.startingStateHash as string}</div>
    </div>
  );
}

function DeathDetail({ event }: { event: ArenaEvent }) {
  return (
    <div className="rounded-lg bg-bg-surface p-3 text-xs space-y-1">
      <div className="font-medium text-red-600">Death: {event.cause as string}</div>
      {event.details ? <div className="text-text-secondary">{event.details as string}</div> : null}
      {event.lastEncounterId ? <div>Last encounter: {event.lastEncounterId as string}</div> : null}
    </div>
  );
}

function CompleteDetail({ event }: { event: ArenaEvent }) {
  return (
    <div className="rounded-lg bg-bg-surface p-3 text-xs space-y-1">
      <div className="font-medium text-green-600">
        {event.isVictory ? 'Victory' : 'Completed'}
      </div>
      {event.finalScore != null ? <div>Score: {event.finalScore as number}</div> : null}
      {event.e4ApproachCategory ? <div>Approach: {event.e4ApproachCategory as string}</div> : null}
    </div>
  );
}

function ResultDetail({ event }: { event: ArenaEvent }) {
  const resolved = event.resolved as boolean;
  return (
    <div className="rounded-lg bg-bg-surface p-3 text-xs space-y-1">
      <div className={`font-medium ${resolved ? 'text-green-600' : 'text-red-600'}`}>
        {resolved ? 'Resolved' : event.partial ? 'Partial' : 'Failed'}
      </div>
      {event.score != null ? <div>Score: {event.score as number}</div> : null}
      {event.details ? <div className="text-text-secondary">{event.details as string}</div> : null}
    </div>
  );
}
