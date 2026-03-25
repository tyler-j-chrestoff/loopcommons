/**
 * ConflictMonitor — detects contradictions between memories and current input.
 *
 * MVP: keyword/fact extraction with pattern matching.
 * No embeddings — string matching only.
 */

import type { ConflictFlag } from '../guardian/types';
import type { ConflictMonitorFn, ConflictMonitorInput, ConflictMonitorOutput } from './types';

type FactPattern = {
  /** Regex to extract a fact type and its value from text. */
  regex: RegExp;
  /** Human-readable label for the fact type. */
  label: string;
};

const FACT_PATTERNS: FactPattern[] = [
  { regex: /(?:live[sd]?\s+in|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi, label: 'location' },
  { regex: /(?:my\s+)?name\s+is\s+([A-Z][a-z]+)/gi, label: 'name' },
  { regex: /(?:name\s+is\s+)([A-Z][a-z]+)/gi, label: 'name' },
  { regex: /(?:i\s+am|i'm)\s+(\d+)\s+(?:years?\s+old|yo)/gi, label: 'age' },
  { regex: /(?:work[sd]?\s+(?:at|for))\s+([A-Z][\w\s]+?)(?:\.|,|$)/gi, label: 'employer' },
];

function extractFacts(text: string): Map<string, Set<string>> {
  const facts = new Map<string, Set<string>>();
  for (const pattern of FACT_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text)) !== null) {
      const value = match[1].trim().toLowerCase();
      if (!value) continue;
      const existing = facts.get(pattern.label) ?? new Set();
      existing.add(value);
      facts.set(pattern.label, existing);
    }
  }
  return facts;
}

export function createConflictMonitor(): ConflictMonitorFn {
  return function conflictMonitor(input: ConflictMonitorInput): ConflictMonitorOutput {
    const start = Date.now();
    const flags: ConflictFlag[] = [];

    const messageText = input.message.content.text;
    if (!messageText || !input.memoryContext) {
      return {
        flags: [],
        traceEvents: [{
          type: 'conflict-monitor:check',
          flagsDetected: 0,
          flags: [],
          latencyMs: Date.now() - start,
          timestamp: Date.now(),
        }],
      };
    }

    const messageFacts = extractFacts(messageText);
    const memoryFacts = extractFacts(input.memoryContext);

    for (const [label, messageValues] of messageFacts) {
      const memoryValues = memoryFacts.get(label);
      if (!memoryValues) continue;

      for (const msgVal of messageValues) {
        for (const memVal of memoryValues) {
          if (msgVal !== memVal) {
            flags.push({
              type: 'memory-contradiction',
              severity: 'medium',
              description: `${label} contradiction: memory says "${memVal}" but message says "${msgVal}"`,
            });
          }
        }
      }
    }

    return {
      flags,
      traceEvents: [{
        type: 'conflict-monitor:check',
        flagsDetected: flags.length,
        flags,
        latencyMs: Date.now() - start,
        timestamp: Date.now(),
      }],
    };
  };
}
