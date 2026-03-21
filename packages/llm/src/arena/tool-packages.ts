import type { ToolPackage } from '../tool';
import type { ArenaToolId, Sandbox } from './types';
import { createSandboxTools } from './sandbox-tools';

export type ArenaToolConfig = {
  derivedPromptFragment: string;
  intent: string[];
  sideEffects: boolean;
  capabilities: string[];
};

export const ARENA_TOOL_CONFIGS: Record<ArenaToolId, ArenaToolConfig> = {
  inspect: {
    derivedPromptFragment:
      'You approach problems through careful observation. You read system state — configs, logs, metrics — to build a complete picture before recommending action. You trust what you can see and verify. Diagnosis precedes treatment.',
    intent: ['observe', 'diagnose'],
    sideEffects: false,
    capabilities: ['read files', 'read service state', 'read metrics', 'read logs'],
  },
  act: {
    derivedPromptFragment:
      'You approach problems through controlled intervention. You probe, test, and modify systems to discover how they behave. The fastest path to understanding is a well-chosen experiment. You trust what you can reproduce.',
    intent: ['intervene', 'fix'],
    sideEffects: true,
    capabilities: ['edit files', 'restart services', 'run scripts', 'set config'],
  },
  search: {
    derivedPromptFragment:
      'You approach problems by finding what they have in common with the past. You search incident histories, runbooks, and changelogs for precedents. Most problems have been seen before in some form. You trust the accumulated wisdom of operational experience.',
    intent: ['research', 'precedent'],
    sideEffects: false,
    capabilities: ['search incident database', 'find runbooks', 'query changelogs'],
  },
  model: {
    derivedPromptFragment:
      'You approach problems by mapping their structure — dependencies, causal chains, feedback loops. You reason from first principles about how components interact. You trust what you can derive from the system\'s architecture.',
    intent: ['analyze', 'structure'],
    sideEffects: false,
    capabilities: ['map dependencies', 'trace causal chains', 'build structural models'],
  },
};

/**
 * Create a ToolPackage wrapping a single arena tool backed by the given sandbox.
 */
export function createArenaToolPackage(toolId: ArenaToolId, sandbox: Sandbox): ToolPackage {
  const config = ARENA_TOOL_CONFIGS[toolId];
  const allTools = createSandboxTools(sandbox);
  const tool = allTools.find(t => t.name === toolId)!;

  return {
    tools: [tool],
    formatContext: () => config.derivedPromptFragment,
    metadata: {
      name: `arena-${toolId}`,
      capabilities: config.capabilities,
      intent: config.intent,
      sideEffects: config.sideEffects,
    },
  };
}
