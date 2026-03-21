/**
 * Live agent and LLM functions for arena experiments.
 *
 * Wraps the Anthropic API via Vercel AI SDK for use as dependency-injected
 * agentFn/llmFn in the arena harness.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, tool as aiTool } from 'ai';
import type { AgentFn, AgentToolCall } from './encounter-engine';

export function createLiveAgentFn(apiKey?: string): AgentFn {
  const client = createAnthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });

  return async (input) => {
    const { prompt, tools } = input;

    // Track tool outputs ourselves since AI SDK step.toolResults extraction is unreliable
    const toolOutputLog: Map<string, string> = new Map();

    const aiTools: Record<string, ReturnType<typeof aiTool>> = {};
    for (const t of tools) {
      aiTools[t.name] = aiTool({
        description: t.description,
        inputSchema: t.parameters,
        execute: async (args: any, context: any) => {
          const result = await t.execute(args);
          // Capture output keyed by toolCallId if available, else by name+args
          const key = context?.toolCallId ?? `${t.name}:${JSON.stringify(args)}`;
          toolOutputLog.set(key, result);
          return result;
        },
      });
    }

    const allToolCalls: AgentToolCall[] = [];
    const systemPrompt = [
      'You are a DevOps agent in a sandboxed environment with files, services, an incident database, and a dependency graph.',
      '',
      'YOUR TOOLS (use only these — no shell commands):',
      '  inspect: READ-ONLY. Targets: "ls" (list files), "services" (list services), file paths, "service:<name>", "metrics:<name>", "logs:<name>".',
      '  act: WRITE. Commands: "restart <service>", "edit <path> <old> <new>", "run <script-path>", "set-config <service> <key> <value>".',
      '  search: Query the incident database by keywords.',
      '  model: Map dependencies. Use "all" for full graph or a service name.',
      '',
      'WORKFLOW: Explore (inspect/model/search) → Diagnose → Act (restart/edit/run/set-config).',
      'You MUST use act to fix things. Describing a fix without executing it means the incident stays open.',
      '',
      'EXAMPLE of correct behavior:',
      '1. model("all") → see dependency graph',
      '2. inspect("services") → see service status',
      '3. act("restart failing-service") → fix the issue',
      'Always end with act commands that fix the problem.',
    ].join('\n');

    const result = await generateText({
      model: client('claude-haiku-4-5-20251001'),
      system: systemPrompt,
      temperature: 0,
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: 'I will investigate this incident step by step using my tools, then apply the fix using the act tool.' },
        { role: 'user', content: 'Go ahead. Use your tools to diagnose, then use act to fix it. Do not stop until you have called act with a fix command (restart, edit, run, set-config, or deploy).' },
      ],
      tools: aiTools,
      maxSteps: 15,
      maxOutputTokens: 1024,
    });

    for (const step of result.steps) {
      if (step.toolCalls) {
        for (const tc of step.toolCalls) {
          const tcAny = tc as Record<string, unknown>;
          const inputObj = (tcAny.input ?? tcAny.args ?? {}) as Record<string, unknown>;
          const callId = tc.toolCallId;
          const fallbackKey = `${tc.toolName}:${JSON.stringify(inputObj)}`;
          const output = toolOutputLog.get(callId)
            ?? toolOutputLog.get(fallbackKey)
            ?? '';
          allToolCalls.push({
            toolName: tc.toolName,
            input: typeof inputObj === 'object' ? inputObj : {},
            output,
          });
        }
      }
    }

    return {
      response: result.text ?? '',
      toolCalls: allToolCalls,
    };
  };
}

export function createLiveLlmFn(apiKey?: string): (prompt: string) => Promise<string> {
  const client = createAnthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });

  return async (prompt: string) => {
    const result = await generateText({
      model: client('claude-haiku-4-5-20251001'),
      messages: [{ role: 'user', content: prompt }],
      maxOutputTokens: 1024,
    });
    return result.text ?? '';
  };
}
