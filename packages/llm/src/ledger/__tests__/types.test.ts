import { describe, it, expect } from 'vitest';
import type {
  Ledger,
  StakeBid,
  StakeReceipt,
  StakeOutcome,
  TransferResult,
  AccountBalance,
} from '../types';

describe('Ledger types', () => {
  it('StakeBid has required fields', () => {
    const bid: StakeBid = {
      subsystemId: 'guardian',
      amount: 100,
      purpose: 'threat assessment',
      timeout: 30,
      correlationId: 'msg-001',
    };
    expect(bid.subsystemId).toBe('guardian');
    expect(bid.amount).toBe(100);
    expect(bid.purpose).toBe('threat assessment');
    expect(bid.timeout).toBe(30);
    expect(bid.correlationId).toBe('msg-001');
  });

  it('StakeReceipt captures pending state', () => {
    const receipt: StakeReceipt = {
      transferId: 'tx-001',
      subsystemId: 'guardian',
      amount: 100,
      purpose: 'threat assessment',
      stakedAt: Date.now(),
      expiresAt: Date.now() + 30_000,
    };
    expect(receipt.transferId).toBe('tx-001');
    expect(receipt.expiresAt).toBeGreaterThan(receipt.stakedAt);
  });

  it('StakeOutcome quality is 0-1 range', () => {
    const good: StakeOutcome = { quality: 1.0 };
    const bad: StakeOutcome = { quality: 0.0 };
    expect(good.quality).toBe(1.0);
    expect(bad.quality).toBe(0.0);
  });

  it('TransferResult reports balance changes', () => {
    const result: TransferResult = {
      success: true,
      energyMoved: 100,
      fromBalance: 900,
      toBalance: 100,
    };
    expect(result.success).toBe(true);
    expect(result.energyMoved).toBe(100);
  });

  it('AccountBalance tracks available and pending', () => {
    const balance: AccountBalance = {
      available: 800,
      pending: 200,
      total: 1000,
    };
    expect(balance.total).toBe(balance.available + balance.pending);
  });

  it('Ledger interface is structurally compatible', () => {
    const mock: Ledger = {
      stake: async () => ({} as StakeReceipt),
      resolve: async () => ({} as TransferResult),
      balance: async () => ({} as AccountBalance),
      fund: async () => ({} as TransferResult),
    };
    expect(mock.stake).toBeDefined();
    expect(mock.resolve).toBeDefined();
    expect(mock.balance).toBeDefined();
    expect(mock.fund).toBeDefined();
  });
});
