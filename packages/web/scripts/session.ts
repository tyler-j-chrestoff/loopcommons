#!/usr/bin/env npx tsx
/**
 * session.ts — CLI for reading and listing session JSONL files.
 *
 * amyg-31: Local session inspection without HTTP.
 *
 * Usage:
 *   npx tsx scripts/session.ts list                     List all sessions
 *   npx tsx scripts/session.ts list --date 2026-03-17   Filter by date
 *   npx tsx scripts/session.ts read <session-id>        Pretty-print events
 */

import { FileSessionWriter } from '../src/lib/session/file-session-writer';
import type { SessionSummary, SessionEvent } from '../src/lib/session-writer';

// ---------------------------------------------------------------------------
// ANSI color helpers (only when stdout is a TTY)
// ---------------------------------------------------------------------------

const isTTY = process.stdout.isTTY ?? false;

const ansi = {
  reset: isTTY ? '\x1b[0m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  dim: isTTY ? '\x1b[2m' : '',
  red: isTTY ? '\x1b[31m' : '',
  green: isTTY ? '\x1b[32m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
  magenta: isTTY ? '\x1b[35m' : '',
  white: isTTY ? '\x1b[37m' : '',
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = ((ms % 60_000) / 1000).toFixed(0);
  return `${mins}m${secs}s`;
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str : ' '.repeat(len - str.length) + str;
}

// ---------------------------------------------------------------------------
// Event color coding
// ---------------------------------------------------------------------------

function colorForEventType(type: string): string {
  if (!isTTY) return '';
  if (type.startsWith('amygdala:')) return ansi.cyan;
  if (type.startsWith('orchestrator:')) return ansi.magenta;
  if (type.startsWith('security:')) return ansi.yellow;
  if (type.startsWith('rate-limit:')) return ansi.yellow;
  if (type.startsWith('spend:')) return ansi.yellow;
  if (type === 'error' || type === 'tool:error') return ansi.red;
  if (type === 'session:complete' || type === 'round:complete') return ansi.green;
  if (type === 'session:start') return ansi.green;
  return ansi.white;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function listSessions(dateFilter?: string): Promise<void> {
  const writer = new FileSessionWriter();
  const result = await writer.list({ date: dateFilter, limit: 100 });

  if (result.sessions.length === 0) {
    if (dateFilter) {
      console.log(`No sessions found for date ${dateFilter}.`);
    } else {
      console.log('No sessions found.');
    }
    return;
  }

  // Column headers
  const headers = ['ID', 'Date', 'Messages', 'Events', 'Duration'];
  // Compute column widths
  const rows: string[][] = result.sessions.map((s: SessionSummary) => [
    s.id,
    s.date,
    String(s.messageCount),
    String(s.eventCount),
    formatDuration(s.durationMs),
  ]);

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );

  // Right-align numeric columns (Messages, Events, Duration)
  const rightAligned = new Set([2, 3, 4]);

  // Print header
  const headerLine = headers
    .map((h, i) => (rightAligned.has(i) ? padLeft(h, widths[i]) : padRight(h, widths[i])))
    .join('  ');
  console.log(`${ansi.bold}${headerLine}${ansi.reset}`);
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));

  // Print rows
  for (const row of rows) {
    const line = row
      .map((cell, i) =>
        rightAligned.has(i) ? padLeft(cell, widths[i]) : padRight(cell, widths[i]),
      )
      .join('  ');
    console.log(line);
  }

  if (result.nextCursor) {
    console.log(`\n${ansi.dim}(more sessions available — showing first ${rows.length})${ansi.reset}`);
  }
}

async function readSession(sessionId: string): Promise<void> {
  // Validate session ID: alphanumeric + hyphens only
  if (!/^[a-zA-Z0-9-]+$/.test(sessionId)) {
    console.error(`Error: invalid session ID "${sessionId}". Only alphanumeric characters and hyphens are allowed.`);
    process.exit(1);
  }

  const writer = new FileSessionWriter();

  let firstTimestamp: number | null = null;
  let eventCount = 0;

  try {
    for await (const event of writer.read(sessionId)) {
      const ts = (event as Record<string, unknown>).timestamp as number | undefined;
      const relativeMs = ts != null && firstTimestamp != null ? ts - firstTimestamp : 0;
      if (ts != null && firstTimestamp == null) {
        firstTimestamp = ts;
      }

      const type = event.type;
      const color = colorForEventType(type);

      // Build detail string: everything except type and timestamp
      const { type: _type, timestamp: _ts, ...details } = event as Record<string, unknown>;
      const detailStr = Object.keys(details).length > 0 ? JSON.stringify(details) : '';

      const tsLabel = padLeft(`+${relativeMs}ms`, 10);
      console.log(`${ansi.dim}${tsLabel}${ansi.reset}  ${color}${type}${ansi.reset}${detailStr ? `: ${detailStr}` : ''}`);
      eventCount++;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found')) {
      console.error(`Error: session "${sessionId}" not found.`);
      process.exit(1);
    }
    throw err;
  }

  if (eventCount === 0) {
    console.log('(empty session)');
  } else {
    console.log(`\n${ansi.dim}${eventCount} events${ansi.reset}`);
  }
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.error(`Usage:
  npx tsx scripts/session.ts list [--date YYYY-MM-DD]   List sessions
  npx tsx scripts/session.ts read <session-id>          Read session events`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const command = args[0];

  switch (command) {
    case 'list': {
      let dateFilter: string | undefined;
      const dateIdx = args.indexOf('--date');
      if (dateIdx !== -1) {
        dateFilter = args[dateIdx + 1];
        if (!dateFilter || !/^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
          console.error('Error: --date requires a value in YYYY-MM-DD format.');
          process.exit(1);
        }
      }
      await listSessions(dateFilter);
      break;
    }

    case 'read': {
      const sessionId = args[1];
      if (!sessionId) {
        console.error('Error: read command requires a session ID.');
        printUsage();
        process.exit(1);
      }
      await readSession(sessionId);
      break;
    }

    default:
      console.error(`Error: unknown command "${command}".`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
