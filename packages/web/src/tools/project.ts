import { defineTool } from '@loopcommons/llm';
import { z } from 'zod';

const topics = ['architecture', 'trace-system', 'tech-stack', 'agent-loop'] as const;
type Topic = (typeof topics)[number];

const topicData: Record<Topic, string> = {
  architecture: `## Architecture

Loop Commons is a monorepo with two packages:

- **packages/llm** — The agent engine. Provides a model-agnostic agentic loop with tool execution, trace event emission, and cost tracking. Zero UI dependencies.
- **packages/web** — Next.js 16 App Router frontend. Consumes the llm package, exposes a chat API via SSE, and renders an observability dashboard alongside the conversation.

Data flows: User message → POST /api/chat → agent() loop → SSE events → useChat hook → React UI.

Every LLM call, tool execution, and round completion emits typed trace events that the frontend renders in real time.`,

  'trace-system': `## Trace System

The trace system captures every data point from an agent run:

- **Trace**: Top-level container with id, model, provider, config, rounds[], totalUsage, totalCost, status
- **Round**: One LLM call + its tool executions. Captures request messages, response content, tool calls, usage, cost, timing, and the raw provider response (server-side only)
- **ToolExecution**: Per-tool timing, input, output, and error state
- **TraceEvent**: Typed union emitted via TraceCollector interface — round:start, round:complete, tool:start, tool:complete, trace:complete

The route handler streams these events as SSE to the client. The TraceInspector component renders them as an interactive sidebar with round-by-round breakdown, timeline visualization, and cost aggregation.

The meta-quality: this agent can explain its own trace system while producing a trace that demonstrates it.`,

  'tech-stack': `## Tech Stack

- **Framework**: Next.js 16 App Router with Turbopack
- **Styling**: Tailwind CSS v4 (CSS-native config, dark theme)
- **LLM Provider**: Anthropic Claude Haiku 4.5 via Vercel AI SDK v6
- **Language**: TypeScript 5.7 (strict)
- **Testing**: Vitest (llm package has tests; web tests planned)
- **Monorepo**: npm workspaces
- **Hosting**: TBD

Key libraries: ai v6 (Vercel AI SDK), @ai-sdk/anthropic v3, zod for schema validation.`,

  'agent-loop': `## Agent Loop

The agent loop (packages/llm/src/agent/loop.ts) implements a multi-round execution cycle:

1. Call the LLM with conversation history + available tools
2. If the model returns tool calls, execute them (in parallel for independent calls)
3. Append tool results to the conversation and repeat from step 1
4. Stop when the model responds with text only (no tool calls) or maxRounds is reached
5. If maxRounds is hit mid-tool-use, one final call is made without tools to force a text response

Each round emits trace events via the TraceCollector interface. Cost is calculated per-round with model-aware pricing. Token usage is clamped to non-negative integers.

The loop is provider-agnostic — the resolveProvider() function maps model names to provider implementations.`,
};

export const projectTool = defineTool({
  name: 'get_project',
  description:
    'Retrieve details about how Loop Commons is built. Use this when users ask about the architecture, trace system, tech stack, or agent loop design.',
  parameters: z.object({
    topic: z
      .enum(topics)
      .default('architecture')
      .describe('Which aspect of the project to describe'),
  }),
  execute: async ({ topic }) => topicData[topic as Topic],
});
