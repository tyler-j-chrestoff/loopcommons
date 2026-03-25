#!/usr/bin/env npx tsx
/**
 * chat.ts — Interactive CLI for the Loop Commons agent.
 *
 * Usage:
 *   npx tsx scripts/chat.ts                  Chat as public user
 *   npx tsx scripts/chat.ts --admin          Chat with admin privileges
 *   npx tsx scripts/chat.ts --verbose        Show trace events on stderr
 *   npx tsx scripts/chat.ts --admin --verbose
 */

import * as readline from 'node:readline';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { createAgentCore, createRouter, createCliAdapter, getCommitSha, buildAgentIdentity } from '@loopcommons/llm';
import type { InvocationIdentity, TraceEvent, ToolPackage } from '@loopcommons/llm';
import type { Message } from '@loopcommons/llm';
import { createKeywordMemoryPackage } from '@loopcommons/memory/keyword';
import { createResumePackage } from '../src/tools/resume';
import { createProjectPackage } from '../src/tools/project';
import { createBlogToolPackage } from '../src/tools/blog';
import { FileSessionWriter } from '../src/lib/session/file-session-writer';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

export type CliArgs = {
  admin: boolean;
  verbose: boolean;
};

export function parseCliArgs(argv: string[]): CliArgs {
  return {
    admin: argv.includes('--admin'),
    verbose: argv.includes('--verbose'),
  };
}

// ---------------------------------------------------------------------------
// ToolPackage assembly
// ---------------------------------------------------------------------------

export type AssembleConfig = {
  admin: boolean;
  memoryPath: string;
  blogDataDir: string;
  getThreatScore: () => number;
};

export function assembleToolPackages(config: AssembleConfig): ToolPackage[] {
  const resumePackage = createResumePackage();
  const projectPackage = createProjectPackage();
  const blogPackage = createBlogToolPackage({
    dataDir: config.blogDataDir,
    variant: config.admin ? 'writer' : 'reader',
  });
  const memoryPackage = createKeywordMemoryPackage({
    filePath: config.memoryPath,
    getThreatScore: config.getThreatScore,
  });
  return [resumePackage, projectPackage, blogPackage, memoryPackage];
}

// ---------------------------------------------------------------------------
// Identity builder
// ---------------------------------------------------------------------------

export function buildIdentity(opts: { admin: boolean }): InvocationIdentity {
  return {
    interfaceId: 'cli',
    isAdmin: opts.admin,
    isAuthenticated: true,
    commitSha: getCommitSha(),
    requestMetadata: {
      ipHash: 'cli-local',
      isAuthenticated: true,
      isAdmin: opts.admin,
      sessionIndex: 0,
      hourUtc: new Date().getUTCHours(),
    },
  };
}

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const isTTY = process.stdout.isTTY ?? false;
const ansi = {
  reset: isTTY ? '\x1b[0m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  dim: isTTY ? '\x1b[2m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
  green: isTTY ? '\x1b[32m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  magenta: isTTY ? '\x1b[35m' : '',
};

// ---------------------------------------------------------------------------
// Main REPL
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));

  // Paths
  const dataDir = process.env.SESSION_DATA_DIR ?? path.join(process.cwd(), 'data', 'sessions');
  const memoryDataDir = process.env.MEMORY_DATA_DIR ?? path.join(process.cwd(), 'data', 'memory');
  const blogDataDir = process.env.BLOG_DATA_DIR ?? path.join(process.cwd(), 'data', 'blog');

  // Mutable threat score ref (same pattern as route.ts)
  let currentThreatScore = 0;

  const toolPackages = assembleToolPackages({
    admin: args.admin,
    memoryPath: path.join(memoryDataDir, 'world-model.json'),
    blogDataDir,
    getThreatScore: () => currentThreatScore,
  });

  const agentCore = createAgentCore({
    toolPackages,
    onThreatScore: (score) => { currentThreatScore = score; },
  });

  const router = createRouter({
    adapters: [createCliAdapter()],
    core: agentCore,
  });

  // Session persistence
  const sessionWriter = new FileSessionWriter({ basePath: dataDir });
  const sessionId = crypto.randomUUID();
  await sessionWriter.create(sessionId);

  const commitSha = getCommitSha();
  const agentIdentity = await buildAgentIdentity(commitSha, toolPackages, '');
  sessionWriter.append(sessionId, {
    type: 'session:start',
    sessionId,
    interfaceId: 'cli',
    agentIdentity,
    timestamp: Date.now(),
  } as any);

  // Banner
  const mode = args.admin ? `${ansi.yellow}admin${ansi.reset}` : 'public';
  console.log(`${ansi.bold}Loop Commons CLI${ansi.reset} (${mode})`);
  console.log(`${ansi.dim}Session: ${sessionId}${ansi.reset}`);
  console.log(`${ansi.dim}Type /quit to exit.${ansi.reset}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${ansi.green}you>${ansi.reset} `,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }
    if (input === '/quit' || input === '/exit') {
      rl.close();
      return;
    }

    try {
      const routerOutput = await router.process(
        {
          raw: { message: input, isAdmin: args.admin, sessionId },
          channelType: 'cli',
        },
        {
          stream: false,
          identityOverrides: {
            commitSha: getCommitSha(),
            requestMetadata: {
              ipHash: 'cli-local',
              isAuthenticated: true,
              isAdmin: args.admin,
              sessionIndex: 0,
              hourUtc: new Date().getUTCHours(),
            },
          },
          onTraceEvent(event: TraceEvent) {
            sessionWriter.append(sessionId, event as any);
            if (args.verbose) {
              process.stderr.write(`${ansi.dim}[trace] ${event.type}${ansi.reset}\n`);
            }
          },
        },
      );

      const result = routerOutput.coreResult;

      // Print response
      console.log(`\n${ansi.cyan}agent>${ansi.reset} ${result.response}`);

      // Print cost summary
      const totalTokens = result.usage.inputTokens + result.usage.outputTokens;
      console.log(
        `${ansi.dim}[${result.subagentName} | ${totalTokens} tokens | $${result.cost.toFixed(4)}]${ansi.reset}\n`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${ansi.yellow}Error: ${message}${ansi.reset}\n`);
    }

    rl.prompt();
  });

  rl.on('close', async () => {
    await sessionWriter.finalize(sessionId);
    console.log(`\n${ansi.dim}Session saved: ${sessionId}${ansi.reset}`);
    process.exit(0);
  });
}

// Only run main when executed directly (not imported for testing)
const isDirectExecution = process.argv[1]?.endsWith('chat.ts') || process.argv[1]?.endsWith('chat');
if (isDirectExecution) {
  main().catch((err) => {
    console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
