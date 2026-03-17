import { z } from 'zod';
import { tool as aiTool } from 'ai';
/** Definition of a tool that an agent can use */
export type ToolDefinition<TInput extends z.ZodType = z.ZodType> = {
    name: string;
    description: string;
    parameters: TInput;
    execute: (input: z.infer<TInput>) => Promise<string>;
};
/** Type-safe tool definition helper */
export declare function defineTool<T extends z.ZodType>(config: ToolDefinition<T>): ToolDefinition<T>;
/** Registry for looking up tools by name */
export type ToolRegistry = {
    get(name: string): ToolDefinition | undefined;
    has(name: string): boolean;
    list(): string[];
    toProviderFormat(): Record<string, ReturnType<typeof aiTool>>;
};
/** Create a tool registry from an array of tool definitions */
export declare function createToolRegistry(tools: ToolDefinition[]): ToolRegistry;
