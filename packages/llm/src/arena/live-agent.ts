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

    const result = await generateText({
      model: client('claude-haiku-4-5-20251001'),
      system: [
        'You are a DevOps agent with access to tools for diagnosing and fixing infrastructure incidents.',
        'Describing a fix is not the same as applying it. You must use your tools to actually make changes.',
        'If you have an "act" tool, use it to edit configs, restart services, and run scripts.',
        'When finished, summarize what you changed.',
      ].join('\n'),
      messages: [{ role: 'user', content: prompt }],
      tools: aiTools,
      maxSteps: 15,
      maxOutputTokens: 1024,
    });

    for (const step of result.steps) {
      if (step.toolCalls) {
        for (const tc of step.toolCalls) {
          const tcAny = tc as Record<string, unknown>;
          const inputObj = (tcAny.input ?? tcAny.args ?? {}) as Record<string, unknown>;

          // Try multiple strategies to find the tool output
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
