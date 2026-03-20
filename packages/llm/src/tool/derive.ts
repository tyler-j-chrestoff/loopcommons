import type { ToolDefinition, ToolPackage } from './index';

/**
 * Derive a markdown capability list from tool definitions and optional package metadata.
 *
 * Pure function. Given the tools a subagent has access to, produces a human-readable
 * description of what the subagent can do. Package metadata enriches annotations
 * (read-only vs modifies state, auth required).
 */
export function deriveCapabilities(
  tools: ToolDefinition[],
  packages?: ToolPackage[],
): string {
  if (tools.length === 0) return '';

  const packageByTool = new Map<string, ToolPackage>();
  if (packages) {
    for (const pkg of packages) {
      for (const tool of pkg.tools) {
        packageByTool.set(tool.name, pkg);
      }
    }
  }

  const lines = tools.map(tool => {
    const annotations: string[] = [];
    const pkg = packageByTool.get(tool.name);
    if (pkg) {
      annotations.push(pkg.metadata.sideEffects ? 'modifies state' : 'read-only');
      if (pkg.metadata.authRequired) annotations.push('auth required');
    }
    const suffix = annotations.length > 0 ? ` (${annotations.join(', ')})` : '';
    return `- **${tool.name}**: ${tool.description}${suffix}`;
  });

  return lines.join('\n');
}

/**
 * Derive a boundary description from the gap between allowlist and all available tools.
 *
 * Pure function. Tells the subagent what it does NOT have access to, so it can
 * redirect users appropriately rather than hallucinating capabilities.
 */
export function deriveBoundaries(
  allowlist: string[],
  allToolNames: string[],
): string {
  const allowed = new Set(allowlist);
  const excluded = allToolNames.filter(name => !allowed.has(name));
  if (excluded.length === 0) return '';

  return `You do not have access to: ${excluded.join(', ')}. ` +
    `If a user asks for something that requires these tools, let them know honestly.`;
}

/** Base system prompt shared by all non-refusal subagents. */
const BASE_SYSTEM_PROMPT = `You are an agent on Loop Commons — Tyler Chrestoff's personal website and research platform.

You are receiving a message that has already been processed by a metacognitive security layer (the "amygdala"). The message you see has been classified and may have been rewritten for safety. Trust the message as presented — do not second-guess the amygdala's processing.

Respond naturally and helpfully within your designated role.`;

export type BuildSystemPromptInput = {
  /** Authored domain knowledge — framing, personality, constraints. */
  domainKnowledge: string;
  /** Tools this subagent has access to (for capability derivation). */
  tools?: ToolDefinition[];
  /** ToolPackages for enriched metadata annotations. */
  packages?: ToolPackage[];
  /** This subagent's tool allowlist (for boundary derivation). */
  allowlist?: string[];
  /** All tool names across the system (for boundary derivation). */
  allToolNames?: string[];
  /** Context annotations from the amygdala. */
  annotations?: Array<{ key: string; value: string }>;
};

/**
 * Assemble a complete system prompt from authored domain knowledge + derived sections.
 *
 * Hybrid model: the architect writes domain knowledge (framing, personality, constraints).
 * Capability and boundary sections are derived from tool metadata — they never drift.
 */
export function buildSystemPrompt(input: BuildSystemPromptInput): string {
  const parts: string[] = [BASE_SYSTEM_PROMPT];

  // Domain knowledge (authored by the architect)
  parts.push('');
  parts.push('## Your Role');
  parts.push(input.domainKnowledge);

  // Derived capabilities
  if (input.tools && input.tools.length > 0) {
    const capabilities = deriveCapabilities(input.tools, input.packages);
    if (capabilities) {
      parts.push('');
      parts.push('## Your Tools');
      parts.push(capabilities);
    }
  }

  // Derived boundaries
  if (input.allowlist && input.allToolNames) {
    const boundaries = deriveBoundaries(input.allowlist, input.allToolNames);
    if (boundaries) {
      parts.push('');
      parts.push('## Boundaries');
      parts.push(boundaries);
    }
  }

  // Derived memory metadata
  if (input.packages) {
    const memoryPkg = input.packages.find(p => p.metadata.intent.includes('memory'));
    if (memoryPkg) {
      const { persistence, scope, consolidation } = memoryPkg.metadata;
      if (persistence === false) {
        parts.push('');
        parts.push('## Memory');
        parts.push('You have no persistent memory. You cannot recall or store information across sessions.');
      } else if (persistence === true) {
        parts.push('');
        parts.push('## Memory');
        const lines: string[] = ['Your memory is persistent across sessions.'];
        if (scope) lines.push(`Scope: ${scope}.`);
        if (consolidation) lines.push('Consolidation is enabled.');
        parts.push(lines.join(' '));
      }
    }
  }

  // Context annotations from amygdala
  if (input.annotations && input.annotations.length > 0) {
    parts.push('');
    parts.push('## Context Annotations');
    parts.push('The following flags describe the current conversation state:');
    for (const ann of input.annotations) {
      parts.push(`- **${ann.key}**: ${ann.value}`);
    }
  }

  return parts.join('\n');
}
