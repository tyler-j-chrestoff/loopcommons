#!/usr/bin/env tsx
/**
 * Interactive trace debugger — step through JSONL traces like an IDE debugger.
 *
 * Usage:
 *   npm run trace:debug <file.jsonl>
 *   npm run trace:debug arena <experiment-id> <run-id>
 *
 * Controls:
 *   →/n/Enter  Next event
 *   ←/p        Previous event
 *   s          Toggle state panel
 *   g <n>      Go to event N
 *   q/Ctrl-C   Quit
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import {
  loadTrace,
  renderEvent,
  renderState,
  initialState,
  applyEvent,
  type TraceEventRecord,
  type DebugState,
} from '../src/arena/trace-debugger';

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  console.log('Usage:');
  console.log('  npm run trace:debug <file.jsonl>');
  console.log('  npm run trace:debug arena <experiment-id> <run-id>');
  console.log('');
  console.log('Controls:');
  console.log('  →/n/Enter  Next event');
  console.log('  ←/p        Previous event');
  console.log('  s          Toggle state panel');
  console.log('  g <n>      Go to event N');
  console.log('  q/Ctrl-C   Quit');
  process.exit(0);
}

let filePath: string;

if (args[0] === 'arena') {
  const experimentId = args[1];
  const runId = args[2];
  if (!experimentId || !runId) {
    console.error('Usage: npm run trace:debug arena <experiment-id> <run-id>');
    process.exit(1);
  }
  filePath = path.resolve(import.meta.dirname, `../data/arena/${experimentId}/${runId}.jsonl`);
} else {
  filePath = path.resolve(args[0]);
}

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load trace
// ---------------------------------------------------------------------------

const content = fs.readFileSync(filePath, 'utf-8');
const events = loadTrace(content);

if (events.length === 0) {
  console.log('Trace is empty.');
  process.exit(0);
}

// Precompute states at each position
const states: DebugState[] = [initialState()];
for (let i = 0; i < events.length; i++) {
  states.push(applyEvent(states[i], events[i]));
}

// ---------------------------------------------------------------------------
// Interactive loop
// ---------------------------------------------------------------------------

let cursor = 0;
let showState = true;
let showHelp = true; // show help on first render
let gotoBuffer = '';
let gotoMode = false;

function renderHelpBanner(): string {
  return [
    '\x1b[1m  What you\'re looking at:\x1b[0m',
    '',
    '  This is a recording of an AI agent solving infrastructure incidents.',
    '  Each "event" is one thing that happened, in order:',
    '',
    '  \x1b[42m\x1b[30m run:header \x1b[0m       The run starts. Shows which path (tool sequence) this agent got.',
    '  \x1b[43m\x1b[30m choice:point \x1b[0m     A crossroads — the agent chose a new tool. Shows its reasoning.',
    '  \x1b[35m encounter:start \x1b[0m  A new encounter begins. Shows the problem prompt + available tools.',
    '  \x1b[36m encounter:step \x1b[0m   The agent used a tool. Shows input + what came back from the sandbox.',
    '  \x1b[32m agent:response \x1b[0m   The agent\'s text response after using tools. What it thinks happened.',
    '  \x1b[33m encounter:result \x1b[0m Did the agent actually fix it? The sandbox evaluates the real state.',
    '  \x1b[42m\x1b[30m run:complete \x1b[0m     The agent survived all encounters.',
    '  \x1b[41m\x1b[37m run:death \x1b[0m        The agent died (error loop, surrender, etc).',
    '',
    '  The \x1b[1mState\x1b[0m panel (toggle with \'s\') tracks what the agent has at this point:',
    '  which tools it holds, how many steps it\'s taken, and tool usage counts.',
    '',
    '  \x1b[2mPress any key to start stepping through...\x1b[0m',
  ].join('\n');
}

function renderEventExplanation(event: TraceEventRecord): string {
  switch (event.type) {
    case 'run:header':
      return '\x1b[2m  ↑ This agent was assigned to a path that determines which tools it gets offered.\x1b[0m';
    case 'encounter:start':
      return '\x1b[2m  ↑ This is the problem statement given to the agent. The tools listed are what it can use.\x1b[0m';
    case 'choice:point':
      return '\x1b[2m  ↑ The agent was offered tools and chose one. Green + = acquired, red − = dropped.\x1b[0m';
    case 'encounter:step':
      return `\x1b[2m  ↑ The agent called its "${event.toolName}" tool. The │ lines show what the sandbox returned.\x1b[0m`;
    case 'agent:response':
      return '\x1b[2m  ↑ The agent\'s text output — its reasoning and summary of what it did.\x1b[0m';
    case 'encounter:result':
      return '\x1b[2m  ↑ The sandbox was evaluated. Did the agent\'s tool calls actually fix the problem?\x1b[0m';
    case 'run:complete':
      return '\x1b[2m  ↑ Run finished. VICTORY = all encounters resolved. Score = how well.\x1b[0m';
    case 'run:death':
      return '\x1b[2m  ↑ The agent died. It couldn\'t solve the problem with its available tools.\x1b[0m';
    default:
      return '';
  }
}

function render() {
  // Clear screen
  process.stdout.write('\x1b[2J\x1b[H');

  // Header
  const fileName = path.basename(filePath);
  console.log(`\x1b[1m📍 Trace Debugger\x1b[0m — ${fileName} (${events.length} events)\n`);

  if (showHelp) {
    console.log(renderHelpBanner());
    return;
  }

  // State panel
  if (showState) {
    console.log(renderState(states[cursor + 1]));
    console.log('');
  }

  // Current event
  console.log(renderEvent(events[cursor], cursor, events.length));

  // Contextual explanation
  const explanation = renderEventExplanation(events[cursor]);
  if (explanation) {
    console.log('');
    console.log(explanation);
  }

  console.log('');

  // Controls
  const prev = cursor > 0 ? '←prev' : '\x1b[2m←prev\x1b[0m';
  const next = cursor < events.length - 1 ? '→next' : '\x1b[2m→next\x1b[0m';
  if (gotoMode) {
    process.stdout.write(`\x1b[1mGo to event #: ${gotoBuffer}▌\x1b[0m  \x1b[2m(Enter to confirm, Esc to cancel)\x1b[0m`);
  } else {
    process.stdout.write(`\x1b[2m${prev}  ${next}  (s)tate  (g)oto  (h)elp  (q)uit\x1b[0m `);
  }
}

// Set up raw mode for keypress
if (!process.stdin.isTTY) {
  // Non-interactive: just dump all events
  for (let i = 0; i < events.length; i++) {
    console.log(renderEvent(events[i], i, events.length));
    if (showState) console.log(renderState(states[i + 1]));
    console.log('');
  }
  process.exit(0);
}

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

render();

process.stdin.on('keypress', (str, key) => {
  if (!key) return;

  // Ctrl-C always quits
  if (key.ctrl && key.name === 'c') {
    process.stdout.write('\n');
    process.exit(0);
  }

  // Goto mode: accumulate digits, Enter confirms, Escape cancels
  if (gotoMode) {
    if (key.name === 'escape') {
      gotoMode = false;
      gotoBuffer = '';
      render();
      return;
    }
    if (key.name === 'return') {
      const n = parseInt(gotoBuffer, 10);
      gotoMode = false;
      gotoBuffer = '';
      if (!isNaN(n) && n >= 1 && n <= events.length) {
        cursor = n - 1;
      }
      render();
      return;
    }
    if (key.name === 'backspace') {
      gotoBuffer = gotoBuffer.slice(0, -1);
      render();
      return;
    }
    if (str && /\d/.test(str)) {
      gotoBuffer += str;
      render();
      return;
    }
    return;
  }

  // Dismiss help on any key
  if (showHelp) {
    showHelp = false;
    render();
    return;
  }

  // Normal mode
  if (key.name === 'q') {
    process.stdout.write('\n');
    process.exit(0);
  }

  if (key.name === 'right' || key.name === 'n' || key.name === 'return') {
    if (cursor < events.length - 1) {
      cursor++;
      render();
    }
    return;
  }

  if (key.name === 'left' || key.name === 'p') {
    if (cursor > 0) {
      cursor--;
      render();
    }
    return;
  }

  if (key.name === 's') {
    showState = !showState;
    render();
    return;
  }

  if (key.name === 'h') {
    showHelp = !showHelp;
    render();
    return;
  }

  if (key.name === 'g') {
    gotoMode = true;
    gotoBuffer = '';
    render();
    return;
  }

  // Home/end
  if (key.name === 'home') {
    cursor = 0;
    render();
    return;
  }
  if (key.name === 'end') {
    cursor = events.length - 1;
    render();
    return;
  }
});
