/**
 * Live agent and LLM functions for arena experiments.
 *
 * Wraps the Anthropic API via Vercel AI SDK for use as dependency-injected
 * agentFn/llmFn in the arena harness.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, tool as aiTool, stepCountIs } from 'ai';
import type { AgentFn, AgentToolCall } from './encounter-engine';
import { createManaState, prepareStep, consumeMana, type ManaConfig } from './mana';

function buildAiTools(
  tools: import('../tool').ToolDefinition[],
  toolOutputLog: Map<string, string>,
): Record<string, any> {
  const aiTools: Record<string, any> = {};
  for (const t of tools) {
    aiTools[t.name] = aiTool({
      description: t.description,
      inputSchema: t.parameters as any,
      execute: async (args: any, context: any) => {
        const result = await t.execute(args);
        const key = context?.toolCallId ?? `${t.name}:${JSON.stringify(args)}`;
        toolOutputLog.set(key, result);
        return result;
      },
    });
  }
  return aiTools;
}

function extractToolCalls(
  steps: any[],
  toolOutputLog: Map<string, string>,
): AgentToolCall[] {
  const calls: AgentToolCall[] = [];
  for (const step of steps) {
    if (step.toolCalls) {
      for (const tc of step.toolCalls) {
        const tcAny = tc as Record<string, unknown>;
        const inputObj = (tcAny.input ?? tcAny.args ?? {}) as Record<string, unknown>;
        const callId = tc.toolCallId;
        const fallbackKey = `${tc.toolName}:${JSON.stringify(inputObj)}`;
        const output = toolOutputLog.get(callId)
          ?? toolOutputLog.get(fallbackKey)
          ?? '';
        calls.push({
          toolName: tc.toolName,
          input: typeof inputObj === 'object' ? inputObj : {},
          output,
        });
      }
    }
  }
  return calls;
}

const SYSTEM_PROMPT = [
  'You are a DevOps agent in a sandboxed environment with files, services, an incident database, and a dependency graph.',
  '',
  'YOUR TOOLS (use only these — no shell commands):',
  '  inspect: READ-ONLY. Targets: "ls" (list files), "services" (list services), file paths, "service:<name>", "metrics:<name>", "logs:<name>".',
  '  act: WRITE. Commands: "restart <service>", "edit <path> <old> <new>", "run <script-path>", "set-config <service> <key> <value>".',
  '  search: Query the incident database by keywords.',
  '  model: Map dependencies. Use "all" for full graph or a service name.',
  '  done: Signal completion. Call this ONLY after you have applied the fix with act.',
  '',
  'WORKFLOW: Explore (inspect/model/search) → Diagnose → Act (restart/edit/run/set-config) → done.',
  'You MUST use act to fix things. Describing a fix without executing it means the incident stays open.',
  'You MUST call done when finished. Every step must be a tool call — never respond with text only.',
  '',
  'EXAMPLE of correct behavior:',
  '1. inspect("services") → see service status',
  '2. model("all") → see dependency graph',
  '3. act("restart failing-service") → fix the issue',
  '4. done() → signal completion',
].join('\n');

const SEED_MESSAGES: Array<{ role: 'user' | 'assistant'; content: string }> = [
  { role: 'user', content: '' }, // placeholder, replaced with actual prompt
  { role: 'assistant', content: 'I will investigate this incident step by step using my tools, then apply the fix using the act tool.' },
  { role: 'user', content: 'Go ahead. Use your tools to diagnose, then use act to fix it. Do not stop until you have called act with a fix command (restart, edit, run, set-config, or deploy).' },
];

export function createLiveAgentFn(apiKey?: string): AgentFn {
  const client = createAnthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });

  return async (input) => {
    const { prompt, tools, manaConfig, memoryContext } = input;

    const systemPrompt = memoryContext
      ? `${SYSTEM_PROMPT}\n\n--- RELEVANT MEMORIES ---\n${memoryContext}\n--- END MEMORIES ---`
      : SYSTEM_PROMPT;

    const toolOutputLog: Map<string, string> = new Map();
    const allAiTools = buildAiTools(tools, toolOutputLog);
    const allToolCalls: AgentToolCall[] = [];

    if (manaConfig) {
      // Manual step loop with per-step mana filtering
      const manaState = createManaState(manaConfig);
      let messages: any[] = [
        { role: 'user', content: prompt },
        { role: 'assistant', content: 'I will investigate this incident step by step using my tools, then apply the fix using the act tool.' },
        { role: 'user', content: 'Go ahead. Use your tools to diagnose, then use act to fix it. Do not stop until you have called act with a fix command (restart, edit, run, set-config, or deploy).' },
      ];

      const maxSteps = 15;
      for (let step = 0; step < maxSteps; step++) {
        const availableNames = prepareStep(manaState, Object.keys(allAiTools), manaConfig);
        const stepTools: Record<string, any> = {};
        for (const name of availableNames) {
          if (allAiTools[name]) stepTools[name] = allAiTools[name];
        }

        const result = await generateText({
          model: client('claude-haiku-4-5-20251001'),
          system: systemPrompt,
          temperature: 0,
          messages,
          tools: stepTools,
          toolChoice: 'required',
          maxOutputTokens: 1024,
        });

        const stepCalls = extractToolCalls(result.steps, toolOutputLog);
        allToolCalls.push(...stepCalls);

        // Update mana for each tool used
        for (const tc of stepCalls) {
          consumeMana(manaState, tc.toolName, manaConfig);
        }

        // Check for done tool — exit
        if (stepCalls.some(tc => tc.toolName === 'done')) break;

        // Append AI SDK-formatted response messages for next step's context.
        // Filter out empty text content blocks — Anthropic API rejects them.
        const cleaned = result.response.messages.map((msg: any) => {
          if (Array.isArray(msg.content)) {
            const filtered = msg.content.filter((block: any) =>
              block.type !== 'text' || (block.text && block.text.length > 0),
            );
            return { ...msg, content: filtered.length > 0 ? filtered : msg.content };
          }
          return msg;
        });
        messages = [...messages, ...cleaned];
      }

      return { response: '', toolCalls: allToolCalls };
    }

    // No mana — single generateText call (original behavior)
    const result = await generateText({
      model: client('claude-haiku-4-5-20251001'),
      system: systemPrompt,
      temperature: 0,
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: 'I will investigate this incident step by step using my tools, then apply the fix using the act tool.' },
        { role: 'user', content: 'Go ahead. Use your tools to diagnose, then use act to fix it. Do not stop until you have called act with a fix command (restart, edit, run, set-config, or deploy).' },
      ],
      tools: allAiTools,
      toolChoice: 'required',
      stopWhen: stepCountIs(15),
      maxOutputTokens: 1024,
    });

    allToolCalls.push(...extractToolCalls(result.steps, toolOutputLog));

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
