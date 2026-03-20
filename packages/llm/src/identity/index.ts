import { createHash } from 'crypto';
import { execSync } from 'child_process';
import type { ToolPackage } from '../tool';

/**
 * Content-addressed agent identity.
 *
 * Every running agent instance is identified by the git commit that produced it
 * and the tool composition it was constructed with. Two agents from the same
 * commit with the same tools produce the same identity hash.
 */
export type AgentIdentity = {
  /** Git commit SHA that produced the running code. */
  commitSha: string;
  /** SHA-256 of canonical JSON: { commit, tools: [...sorted names] }. */
  toolCompositionHash: string;
  /** SHA-256 of the derived system prompt (commit + tools + derivation). */
  derivedPromptHash: string;
};

/**
 * Lineage record linking a parent identity to a child.
 *
 * Emitted when the agent detects its identity differs from the previous
 * session's identity. The diff describes what changed in tool composition.
 */
export type LineageRecord = {
  /** Parent identity, or null for the first-ever instance (genesis). */
  parent: AgentIdentity | null;
  /** The current agent's identity. */
  child: AgentIdentity;
  /** What changed in tool composition between parent and child. */
  toolDiff: {
    added: string[];
    removed: string[];
  };
};

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Compute a deterministic tool composition hash.
 *
 * SHA-256 of canonical JSON: { commit, tools: [...sorted names] }.
 * Tool names are sorted so input order doesn't matter.
 */
export async function computeIdentity(
  commitSha: string,
  toolNames: string[],
): Promise<string> {
  return sha256(JSON.stringify({
    commit: commitSha,
    tools: [...toolNames].sort(),
  }));
}

/**
 * Build a complete AgentIdentity from commit SHA, tool packages, and domain knowledge.
 *
 * The derivedPromptHash captures the full derivation input — commit + tools + domain.
 * Two agents with the same tools but different domain knowledge get the same
 * toolCompositionHash but different derivedPromptHash.
 */
export async function buildAgentIdentity(
  commitSha: string,
  toolPackages: ToolPackage[],
  domainKnowledge: string,
): Promise<AgentIdentity> {
  const toolNames = toolPackages.flatMap(p => p.tools.map(t => t.name));
  const toolCompositionHash = await computeIdentity(commitSha, toolNames);

  const derivedPromptHash = sha256(JSON.stringify({
    commit: commitSha,
    tools: [...toolNames].sort(),
    domain: domainKnowledge,
  }));

  return { commitSha, toolCompositionHash, derivedPromptHash };
}

/**
 * Get the current git commit SHA.
 *
 * Reads RAILWAY_GIT_COMMIT_SHA in production. Falls back to `git rev-parse HEAD`
 * in dev. Returns 'unknown' if neither is available.
 */
export function getCommitSha(): string {
  if (process.env.RAILWAY_GIT_COMMIT_SHA) {
    return process.env.RAILWAY_GIT_COMMIT_SHA;
  }
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Compute the diff between two tool name sets.
 *
 * Returns sorted arrays of added and removed tool names.
 */
export function computeToolDiff(
  parentTools: string[],
  childTools: string[],
): { added: string[]; removed: string[] } {
  const parentSet = new Set(parentTools);
  const childSet = new Set(childTools);
  return {
    added: [...childSet].filter(t => !parentSet.has(t)).sort(),
    removed: [...parentSet].filter(t => !childSet.has(t)).sort(),
  };
}

/**
 * Build a LineageRecord from parent/child identities and their tool lists.
 *
 * The parent is null for genesis (first-ever agent instance).
 */
export function buildLineageRecord(
  parent: AgentIdentity | null,
  child: AgentIdentity,
  parentTools: string[],
  childTools: string[],
): LineageRecord {
  return {
    parent,
    child,
    toolDiff: computeToolDiff(parentTools, childTools),
  };
}
