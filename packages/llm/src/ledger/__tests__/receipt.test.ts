import { describe, it, expect } from 'vitest';
import { renderReceipt } from '../receipt';
import type { StakeReceipt } from '../types';

describe('renderReceipt', () => {
  it('renders a single receipt', () => {
    const receipts: StakeReceipt[] = [
      {
        transferId: 'tx-1',
        subsystemId: 'guardian',
        amount: 100,
        purpose: 'threat assessment',
        stakedAt: 1711300000000,
        expiresAt: 1711300030000,
      },
    ];
    const output = renderReceipt(receipts);
    expect(output).toContain('guardian');
    expect(output).toContain('threat assessment');
    expect(output).toContain('100');
  });

  it('renders multiple receipts with total', () => {
    const receipts: StakeReceipt[] = [
      {
        transferId: 'tx-1',
        subsystemId: 'guardian',
        amount: 100,
        purpose: 'threat assessment',
        stakedAt: 1711300000000,
        expiresAt: 1711300030000,
      },
      {
        transferId: 'tx-2',
        subsystemId: 'router',
        amount: 50,
        purpose: 'normalize + dispatch',
        stakedAt: 1711300000000,
        expiresAt: 1711300030000,
      },
      {
        transferId: 'tx-3',
        subsystemId: 'orchestrator',
        amount: 10,
        purpose: 'routing',
        stakedAt: 1711300000000,
        expiresAt: 1711300030000,
      },
    ];
    const output = renderReceipt(receipts);
    expect(output).toContain('guardian');
    expect(output).toContain('router');
    expect(output).toContain('orchestrator');
    expect(output).toContain('160'); // total
  });

  it('returns empty string for no receipts', () => {
    expect(renderReceipt([])).toBe('');
  });
});
