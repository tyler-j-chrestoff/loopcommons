import type { StakeReceipt } from './types';

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
