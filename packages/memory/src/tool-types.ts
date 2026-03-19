/**
 * Minimal tool types for memory package.
 *
 * Structurally identical to @loopcommons/llm's ToolDefinition.
 * TypeScript structural typing ensures assignment compatibility.
 */

import { z } from 'zod';

export type ToolDefinition<TInput extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  parameters: TInput;
  execute: (input: z.infer<TInput>) => Promise<string>;
};

export function defineTool<T extends z.ZodType>(config: ToolDefinition<T>): ToolDefinition<T> {
  return config;
}
