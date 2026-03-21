/**
 * Trace debugger — step through JSONL trace events like a debugger.
 *
 * Works on any JSONL trace (arena, session, etc.) with rich rendering
 * for known event types. Pure formatting functions + state tracking.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TraceEventRecord = Record<string, unknown> & { type: string };

export type DebugState = {
  runId: string | null;
  pathId: string | null;
  currentEncounter: string | null;
  tools: string[];
  stateHash: string;
  stepCount: number;
  encounterSteps: Record<string, number>;
  toolUsage: Record<string, number>;
  dead: boolean;
  deathCause: string | null;
};

// ---------------------------------------------------------------------------
// ANSI
// ---------------------------------------------------------------------------

const NO_COLOR = !!process.env.NO_COLOR;
const c = {
  bold: (s: string) => NO_COLOR ? s : `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => NO_COLOR ? s : `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => NO_COLOR ? s : `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => NO_COLOR ? s : `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => NO_COLOR ? s : `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => NO_COLOR ? s : `\x1b[36m${s}\x1b[0m`,
  magenta: (s: string) => NO_COLOR ? s : `\x1b[35m${s}\x1b[0m`,
  bgRed: (s: string) => NO_COLOR ? s : `\x1b[41m\x1b[37m${s}\x1b[0m`,
  bgGreen: (s: string) => NO_COLOR ? s : `\x1b[42m\x1b[30m${s}\x1b[0m`,
  bgYellow: (s: string) => NO_COLOR ? s : `\x1b[43m\x1b[30m${s}\x1b[0m`,
};

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export function loadTrace(jsonl: string): TraceEventRecord[] {
  return jsonl
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => JSON.parse(l) as TraceEventRecord);
}

// ---------------------------------------------------------------------------
// State tracking
// ---------------------------------------------------------------------------

export function initialState(): DebugState {
  return {
    runId: null,
    pathId: null,
    currentEncounter: null,
    tools: [],
    stateHash: 'genesis',
    stepCount: 0,
    encounterSteps: {},
    toolUsage: {},
    dead: false,
    deathCause: null,
  };
}

export function applyEvent(state: DebugState, event: TraceEventRecord): DebugState {
  const s = { ...state, tools: [...state.tools], encounterSteps: { ...state.encounterSteps }, toolUsage: { ...state.toolUsage } };

  switch (event.type) {
    case 'run:header':
      s.runId = event.runId as string;
      s.pathId = event.pathId as string;
      s.stateHash = (event.startingStateHash as string) ?? 'genesis';
      break;

    case 'choice:point': {
      const tool = event.selectedTool as string;
      const dropped = event.droppedTool as string | null;
      if (dropped) {
        const idx = s.tools.indexOf(dropped);
        if (idx >= 0) s.tools.splice(idx, 1);
      }
      if (!s.tools.includes(tool)) s.tools.push(tool);
      s.stateHash = (event.stateHash as string) ?? s.stateHash;
      break;
    }

    case 'encounter:step': {
      const enc = event.encounterId as string;
      s.currentEncounter = enc;
      s.stepCount++;
      s.encounterSteps[enc] = (s.encounterSteps[enc] ?? 0) + 1;
      const tool = event.toolName as string;
      s.toolUsage[tool] = (s.toolUsage[tool] ?? 0) + 1;
      break;
    }

    case 'encounter:start':
      s.currentEncounter = event.encounterId as string;
      break;

    case 'run:death':
      s.dead = true;
      s.deathCause = (event.cause as string) ?? null;
      break;
  }

  return s;
}

// ---------------------------------------------------------------------------
// Render: state sidebar
// ---------------------------------------------------------------------------

export function renderState(state: DebugState): string {
  const lines: string[] = [
    c.bold('── State ──'),
    `  run:       ${state.runId ?? c.dim('(none)')}`,
    `  path:      ${state.pathId ?? c.dim('(none)')}`,
    `  encounter: ${state.currentEncounter ?? c.dim('(none)')}`,
    `  tools:     ${state.tools.length > 0 ? state.tools.map(t => c.cyan(t)).join(', ') : c.dim('(none)')}`,
    `  hash:      ${c.dim(state.stateHash.slice(0, 12))}`,
    `  steps:     ${state.stepCount}`,
  ];

  if (Object.keys(state.encounterSteps).length > 0) {
    const parts = Object.entries(state.encounterSteps).map(([e, n]) => `${e}:${n}`);
    lines.push(`  per-enc:   ${parts.join(', ')}`);
  }

  if (Object.keys(state.toolUsage).length > 0) {
    const parts = Object.entries(state.toolUsage)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t}:${n}`);
    lines.push(`  tool-use:  ${parts.join(', ')}`);
  }

  if (state.dead) {
    lines.push(`  ${c.bgRed(' DEAD ')} ${state.deathCause ?? 'unknown cause'}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Render: single event
// ---------------------------------------------------------------------------

export function renderEvent(event: TraceEventRecord, index: number, total: number): string {
  const position = c.dim(`[${index + 1}/${total}]`);
  const typeTag = renderTypeTag(event.type);

  switch (event.type) {
    case 'run:header':
      return [
        `${position} ${typeTag}`,
        `  ${c.bold('Run:')} ${event.runId}  ${c.bold('Path:')} ${event.pathId}`,
        event.pathLabel ? `  ${c.bold('Sequence:')} ${event.pathLabel}` : '',
        `  ${c.bold('Started:')} ${event.startedAt}`,
        `  ${c.bold('State:')} ${event.startingStateHash}`,
      ].filter(Boolean).join('\n');

    case 'encounter:start':
      return renderEncounterStart(event, position, typeTag);

    case 'choice:point':
      return renderChoicePoint(event, position, typeTag);

    case 'encounter:step':
      return renderEncounterStep(event, position, typeTag);

    case 'agent:response':
      return renderAgentResponse(event, position, typeTag);

    case 'encounter:result':
      return renderEncounterResult(event, position, typeTag);

    case 'run:complete':
      return renderRunComplete(event, position, typeTag);

    case 'run:death':
      return renderRunDeath(event, position, typeTag);

    default:
      return renderGenericEvent(event, position, typeTag);
  }
}

// ---------------------------------------------------------------------------
// Event-specific renderers
// ---------------------------------------------------------------------------

function renderEncounterStart(event: TraceEventRecord, position: string, typeTag: string): string {
  const prompt = event.prompt as string;
  const tools = event.availableTools as string[];

  const lines = [
    `${position} ${typeTag} ${c.bold(event.encounterName as string)} (${event.encounterId})`,
    `  ${c.bold('Tools available:')} [${tools.map(t => c.cyan(t)).join(', ')}]`,
    ``,
    `  ${c.bold('Prompt given to agent:')}`,
  ];

  const promptLines = prompt.split('\n');
  for (const line of promptLines.slice(0, 15)) {
    lines.push(`  ${c.dim('│')} ${line}`);
  }
  if (promptLines.length > 15) {
    lines.push(`  ${c.dim(`│ ... (${promptLines.length} lines)`)}`);
  }

  return lines.join('\n');
}

function renderChoicePoint(event: TraceEventRecord, position: string, typeTag: string): string {
  const tool = event.selectedTool as string;
  const dropped = event.droppedTool as string | null;
  const confidence = event.confidenceScore as number;
  const confColor = confidence >= 0.7 ? c.green : confidence >= 0.4 ? c.yellow : c.red;

  const lines = [
    `${position} ${typeTag} @ ${c.cyan(event.encounterId as string)}`,
    `  ${c.green('+ ' + tool)} ${confColor(`(${confidence.toFixed(2)})`)}${dropped ? '  ' + c.red('− ' + dropped) : ''}`,
    `  ${c.bold('Offered:')} [${(event.offeredTools as string[]).join(', ')}]  ${c.bold('Current:')} [${(event.currentTools as string[]).join(', ')}]`,
  ];

  const reasoning = event.acquisitionReasoning as string;
  if (reasoning) {
    lines.push(`  ${c.bold('Why:')} ${truncate(reasoning, 200)}`);
  }

  const sacrifice = event.sacrificeReasoning as string | null;
  if (sacrifice) {
    lines.push(`  ${c.bold('Sacrifice:')} ${truncate(sacrifice, 150)}`);
  }

  const forward = event.forwardModel as string;
  if (forward) {
    lines.push(`  ${c.bold('Forward:')} ${truncate(forward, 150)}`);
  }

  lines.push(`  → ${c.dim(event.stateHash as string)}`);

  return lines.join('\n');
}

function renderEncounterStep(event: TraceEventRecord, position: string, typeTag: string): string {
  const toolName = event.toolName as string;
  const input = event.toolInput as Record<string, unknown>;
  const output = event.toolOutput as string ?? '';
  const duration = event.durationMs as number;
  const enc = event.encounterId as string;
  const step = event.stepIndex as number;

  const toolColor = toolName === 'act' ? c.red : toolName === 'inspect' ? c.cyan : toolName === 'search' ? c.yellow : c.magenta;

  const inputStr = Object.entries(input)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(', ');

  const lines = [
    `${position} ${typeTag} ${c.dim(enc + ':' + step)}  ${toolColor(toolName)}(${inputStr})  ${c.dim(duration + 'ms')}`,
  ];

  if (output) {
    const formatted = formatOutput(output);
    lines.push(formatted);
  }

  return lines.join('\n');
}

function renderAgentResponse(event: TraceEventRecord, position: string, typeTag: string): string {
  const response = event.response as string;
  const lines = [
    `${position} ${typeTag} @ ${c.cyan(event.encounterId as string)}`,
    ``,
    `  ${c.bold('Agent said:')}`,
  ];

  const responseLines = response.split('\n');
  for (const line of responseLines.slice(0, 20)) {
    lines.push(`  ${c.dim('│')} ${line}`);
  }
  if (responseLines.length > 20) {
    lines.push(`  ${c.dim(`│ ... (${responseLines.length} lines)`)}`);
  }

  return lines.join('\n');
}

function renderEncounterResult(event: TraceEventRecord, position: string, typeTag: string): string {
  const resolved = event.resolved as boolean;
  const score = event.score as number;
  const details = event.details as string;
  const statusBadge = resolved ? c.bgGreen(' RESOLVED ') : (event.partial ? c.bgYellow(' PARTIAL ') : c.bgRed(' FAILED '));

  return [
    `${position} ${typeTag} @ ${c.cyan(event.encounterId as string)}`,
    `  ${statusBadge} score: ${score}`,
    details ? `  ${c.dim(truncate(details, 200))}` : '',
  ].filter(Boolean).join('\n');
}

function renderRunComplete(event: TraceEventRecord, position: string, typeTag: string): string {
  const victory = event.isVictory as boolean;
  const score = event.finalScore as number | null;
  const approach = event.e4ApproachCategory as string | null;

  return [
    `${position} ${typeTag}`,
    `  ${victory ? c.bgGreen(' VICTORY ') : c.bgYellow(' INCOMPLETE ')} ${score != null ? `score: ${score}` : ''}`,
    approach ? `  ${c.bold('Approach:')} ${approach}` : '',
    `  ${c.bold('Completed:')} ${event.completedAt}`,
  ].filter(Boolean).join('\n');
}

function renderRunDeath(event: TraceEventRecord, position: string, typeTag: string): string {
  return [
    `${position} ${typeTag}`,
    `  ${c.bgRed(' DEAD ')} ${c.bold(event.cause as string ?? 'unknown')}`,
    `  ${event.details ?? ''}`,
    event.lastEncounterId ? `  ${c.bold('At:')} ${event.lastEncounterId}` : '',
    `  ${c.bold('Time of death:')} ${event.completedAt}`,
  ].filter(Boolean).join('\n');
}

function renderGenericEvent(event: TraceEventRecord, position: string, typeTag: string): string {
  const entries = Object.entries(event)
    .filter(([k]) => k !== 'type')
    .map(([k, v]) => `  ${c.bold(k + ':')} ${truncate(String(v), 100)}`);

  return [`${position} ${typeTag}`, ...entries].join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTypeTag(type: string): string {
  const colors: Record<string, (s: string) => string> = {
    'run:header': c.bgGreen,
    'encounter:start': c.magenta,
    'choice:point': c.bgYellow,
    'encounter:step': c.cyan,
    'agent:response': c.green,
    'encounter:result': c.yellow,
    'run:complete': c.bgGreen,
    'run:death': c.bgRed,
  };
  const color = colors[type] ?? c.dim;
  return color(` ${type} `);
}

function truncate(s: string, max: number): string {
  const oneLine = s.replace(/\n/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine;
}

function formatOutput(output: string): string {
  const trimmed = output.trim();
  if (trimmed.length === 0) return c.dim('  (no output)');

  // Try to pretty-print JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      const pretty = JSON.stringify(parsed, null, 2);
      const lines = pretty.split('\n');
      if (lines.length > 8) {
        return lines.slice(0, 8).map(l => c.dim('  │ ') + l).join('\n') + '\n' + c.dim(`  │ ... (${lines.length} lines)`);
      }
      return lines.map(l => c.dim('  │ ') + l).join('\n');
    } catch {
      // not JSON
    }
  }

  // Plain text output
  const lines = trimmed.split('\n');
  if (lines.length > 6) {
    return lines.slice(0, 6).map(l => c.dim('  │ ') + truncate(l, 120)).join('\n') + '\n' + c.dim(`  │ ... (${lines.length} lines)`);
  }
  return lines.map(l => c.dim('  │ ') + truncate(l, 120)).join('\n');
}
