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
export function defineTool<T extends z.ZodType>(config: ToolDefinition<T>): ToolDefinition<T> {
  return config;
}

/** A composable package of tools with context formatting for amygdala injection */
export type ToolPackage = {
  /** Tools provided by this package (LLM-callable, appear in derived prompts) */
  tools: ToolDefinition[];
  /** Format recalled state as context string for amygdala system prompt */
  formatContext: () => string;
  /** Package metadata for discovery and composition */
  metadata: {
    name: string;
    capabilities: string[];
    /** What the tools in this package are for (feeds derived-prompts). */
    intent: string[];
    /** Whether any tool in this package modifies state. */
    sideEffects: boolean;
    /** Whether tools require authenticated admin access. */
    authRequired?: boolean;
    cost?: string;
    /** Whether memory survives the session (memory packages only). */
    persistence?: boolean;
    /** Visibility boundary: private, shared, or inherited (memory packages only). */
    scope?: 'private' | 'shared' | 'inherited';
    /** Whether this strategy responds to consolidation signals (memory packages only). */
    consolidation?: boolean;
  };
  /**
   * System methods — orchestrator-callable, never in LLM tool list or derived prompts.
   * Keyed by method name. The orchestrator calls these at lifecycle boundaries.
   */
  systemMethods?: Record<string, (...args: any[]) => Promise<any>>;
};

/** Registry for looking up tools by name */
export type ToolRegistry = {
  get(name: string): ToolDefinition | undefined;
  has(name: string): boolean;
  list(): string[];
  toProviderFormat(): Record<string, ReturnType<typeof aiTool>>;
};

/** Create a tool registry from an array of tool definitions */
export function createToolRegistry(tools: ToolDefinition[]): ToolRegistry {
  const map = new Map<string, ToolDefinition>(tools.map(t => [t.name, t]));

  return {
    get: (name) => map.get(name),
    has: (name) => map.has(name),
    list: () => [...map.keys()],
    toProviderFormat: () => {
      const result: Record<string, any> = {};
      for (const t of tools) {
        result[t.name] = aiTool({
          description: t.description,
          inputSchema: t.parameters,  // v6 uses inputSchema, NOT parameters
          execute: t.execute,
        });
      }
      return result;
    },
  };
}

/**
 * Create a scoped tool registry containing only the tools in the allowlist.
 *
 * Used by the orchestrator to enforce least-privilege tool access per subagent.
 * Tools not in the allowlist are invisible to the subagent — it cannot call them
 * and does not know they exist.
 *
 * An empty allowlist returns an empty registry (no tools).
 */
export function createScopedRegistry(
  fullRegistry: ToolRegistry,
  allowlist: string[],
): ToolRegistry {
  const allowed = new Set(allowlist);
  const scopedTools: ToolDefinition[] = [];

  for (const name of fullRegistry.list()) {
    if (allowed.has(name)) {
      const tool = fullRegistry.get(name);
      if (tool) scopedTools.push(tool);
    }
  }

  return createToolRegistry(scopedTools);
}
