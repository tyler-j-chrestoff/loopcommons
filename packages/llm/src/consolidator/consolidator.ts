/**
 * Consolidator — provenance-tracked memory writes with threat gating.
 *
 * Only subsystem that writes to long-term memory.
 * Applies 4-band threat gating from the Guardian.
 */

import type { OperationMeta, StoreReceipt } from '@loopcommons/memory/contract';
import type {
  ConsolidatorFn,
  ConsolidatorInput,
  ConsolidatorOutput,
  ConsolidatorTraceEvent,
  MemoryProvenance,
} from './types';

type GatingBand = 'full' | 'elevated' | 'blocked' | 'refusal';

function classifyThreat(score: number): GatingBand {
  if (score >= 0.8) return 'refusal';
  if (score >= 0.5) return 'blocked';
  if (score >= 0.3) return 'elevated';
  return 'full';
}

function extractUserStatements(history: { role: string; content: string }[]): string[] {
  return history
    .filter(m => m.role === 'user' && m.content.trim().length > 0)
    .map(m => m.content);
}

export function createConsolidator(): ConsolidatorFn {
  return async function consolidator(input: ConsolidatorInput): Promise<ConsolidatorOutput> {
    const start = Date.now();
    const { signal, memoryContract, threadHistory } = input;
    const band = classifyThreat(signal.threatScore);

    const provenance: MemoryProvenance = {
      channelType: signal.channelType,
      threadId: signal.threadId,
      timestamp: signal.timestamp,
    };

    const stored: StoreReceipt[] = [];

    if (band === 'blocked' || band === 'refusal') {
      // No writes allowed
    } else {
      const userStatements = extractUserStatements(threadHistory);
      for (const statement of userStatements) {
        const meta: OperationMeta = {
          tags: [`channel:${signal.channelType}`, `intent:${signal.intent}`],
          ...(signal.threadId ? { tags: [`channel:${signal.channelType}`, `intent:${signal.intent}`, `thread:${signal.threadId}`] } : {}),
          ...(band === 'elevated' ? { uncertainty: 0.7 } : {}),
        };
        const receipt = await memoryContract.store(
          {
            type: 'observation',
            subject: 'user',
            content: statement,
            source: signal.channelType,
          },
          meta,
        );
        stored.push(receipt);
      }
    }

    // Delegate consolidation lifecycle
    let pruned = 0;
    try {
      const stats = await memoryContract.consolidate({ type: 'session_end' });
      pruned = stats.pruned;
    } catch {
      // Consolidation failure should not break the pipeline
    }

    const traceEvent: ConsolidatorTraceEvent = {
      type: 'consolidator:write',
      stored: stored.length,
      merged: 0,
      pruned,
      gatingBand: band,
      threatScore: signal.threatScore,
      provenance,
      latencyMs: Date.now() - start,
      timestamp: Date.now(),
    };

    return {
      stored,
      merged: [],
      pruned,
      traceEvents: [traceEvent],
    };
  };
}
