import type { StakeReceipt } from './types';
import type { ConsolidatorTraceEvent } from '../consolidator/types';

export function renderReceipt(receipts: StakeReceipt[]): string {
  if (receipts.length === 0) return '';

  const lines = ['Energy Receipt', '─'.repeat(40)];

  for (const r of receipts) {
    lines.push(`  ${r.subsystemId}: ${r.amount} energy — ${r.purpose}`);
  }

  const total = receipts.reduce((sum, r) => sum + r.amount, 0);
  lines.push('─'.repeat(40));
  lines.push(`  Total: ${total} energy`);

  return lines.join('\n');
}

export function renderConsolidationReceipt(events: ConsolidatorTraceEvent[]): string {
  if (events.length === 0) return '';

  const totalStored = events.reduce((sum, e) => sum + e.stored, 0);
  const channels = [...new Set(events.map(e => e.provenance.channelType))];
  const memoryWord = totalStored === 1 ? 'memory' : 'memories';

  const lines = [
    'Memory Consolidation',
    '─'.repeat(40),
    `  ${totalStored} ${memoryWord} stored via ${channels.join(' + ')}`,
  ];

  for (const event of events) {
    const { provenance, gatingBand, stored } = event;
    const channelLabel = provenance.threadId
      ? `${provenance.channelType} (${provenance.threadId})`
      : provenance.channelType;
    lines.push(`  ${channelLabel}: ${stored} stored [${gatingBand}]`);
  }

  return lines.join('\n');
}
