import { describe, it, expect, beforeEach } from 'vitest';
import { createSimpleLedger } from '../simple-ledger';
import type { Ledger, StakeReceipt } from '../types';

describe('SimpleLedger', () => {
  let ledger: Ledger;

  beforeEach(() => {
    ledger = createSimpleLedger();
  });

  describe('fund', () => {
    it('creates an account with funded balance', async () => {
      const result = await ledger.fund('guardian', 1000, 'initial');
      expect(result.success).toBe(true);
      expect(result.toBalance).toBe(1000);
      expect(result.energyMoved).toBe(1000);
    });

    it('adds to existing balance', async () => {
      await ledger.fund('guardian', 1000, 'initial');
      const result = await ledger.fund('guardian', 500, 'topup');
      expect(result.toBalance).toBe(1500);
    });
  });

  describe('balance', () => {
    it('returns zero for unknown account', async () => {
      const bal = await ledger.balance('unknown');
      expect(bal.available).toBe(0);
      expect(bal.pending).toBe(0);
      expect(bal.total).toBe(0);
    });

    it('reflects funded amount', async () => {
      await ledger.fund('guardian', 1000, 'initial');
      const bal = await ledger.balance('guardian');
      expect(bal.available).toBe(1000);
      expect(bal.pending).toBe(0);
      expect(bal.total).toBe(1000);
    });
  });

  describe('stake', () => {
    it('decrements available and increments pending', async () => {
      await ledger.fund('guardian', 1000, 'initial');
      const receipt = await ledger.stake({
        subsystemId: 'guardian',
        amount: 200,
        purpose: 'threat assessment',
        timeout: 30,
        correlationId: 'msg-001',
      });
      expect(receipt.transferId).toBeTruthy();
      expect(receipt.subsystemId).toBe('guardian');
      expect(receipt.amount).toBe(200);
      expect(receipt.purpose).toBe('threat assessment');

      const bal = await ledger.balance('guardian');
      expect(bal.available).toBe(800);
      expect(bal.pending).toBe(200);
      expect(bal.total).toBe(1000);
    });

    it('rejects stake when insufficient balance', async () => {
      await ledger.fund('guardian', 100, 'initial');
      await expect(
        ledger.stake({
          subsystemId: 'guardian',
          amount: 200,
          purpose: 'too expensive',
          timeout: 30,
          correlationId: 'msg-002',
        }),
      ).rejects.toThrow(/insufficient/i);
    });

    it('rejects stake on unfunded account', async () => {
      await expect(
        ledger.stake({
          subsystemId: 'unknown',
          amount: 100,
          purpose: 'test',
          timeout: 30,
          correlationId: 'msg-003',
        }),
      ).rejects.toThrow(/insufficient/i);
    });
  });

  describe('resolve', () => {
    let receipt: StakeReceipt;

    beforeEach(async () => {
      await ledger.fund('guardian', 1000, 'initial');
      receipt = await ledger.stake({
        subsystemId: 'guardian',
        amount: 200,
        purpose: 'threat assessment',
        timeout: 30,
        correlationId: 'msg-001',
      });
    });

    it('perfect quality returns energy via reward rate', async () => {
      const result = await ledger.resolve(receipt, { quality: 1.0 });
      expect(result.success).toBe(true);
      // quality=1.0 with default rewardRate=0.5 → consumed = 200 * (1 - 1.0 * 0.5) = 100
      // returned = 200 - 100 = 100
      const bal = await ledger.balance('guardian');
      expect(bal.pending).toBe(0);
      expect(bal.available).toBe(900); // 800 + 100 returned
    });

    it('zero quality slashes full stake', async () => {
      const result = await ledger.resolve(receipt, { quality: 0.0 });
      expect(result.success).toBe(true);
      // quality=0.0 → consumed = 200 * (1 - 0) = 200, returned = 0
      const bal = await ledger.balance('guardian');
      expect(bal.pending).toBe(0);
      expect(bal.available).toBe(800); // nothing returned
    });

    it('rejects double-resolve', async () => {
      await ledger.resolve(receipt, { quality: 1.0 });
      await expect(
        ledger.resolve(receipt, { quality: 1.0 }),
      ).rejects.toThrow(/already resolved|unknown/i);
    });
  });

  describe('conservation', () => {
    it('total energy is conserved across stake+resolve cycle', async () => {
      await ledger.fund('guardian', 500, 'initial');
      await ledger.fund('router', 500, 'initial');

      const totalBefore = await sumBalances(ledger, ['guardian', 'router']);

      const r1 = await ledger.stake({
        subsystemId: 'guardian',
        amount: 100,
        purpose: 'assess',
        timeout: 30,
        correlationId: 'c1',
      });
      const r2 = await ledger.stake({
        subsystemId: 'router',
        amount: 50,
        purpose: 'normalize',
        timeout: 30,
        correlationId: 'c1',
      });

      // Mid-cycle: total should still be conserved (pending counts)
      const totalMid = await sumBalances(ledger, ['guardian', 'router']);
      expect(totalMid).toBe(totalBefore);

      await ledger.resolve(r1, { quality: 0.8 });
      await ledger.resolve(r2, { quality: 1.0 });

      // Post-resolve: consumed energy leaves the system
      const totalAfter = await sumBalances(ledger, ['guardian', 'router']);
      expect(totalAfter).toBeLessThanOrEqual(totalBefore);
    });
  });
});

async function sumBalances(ledger: Ledger, accounts: string[]): Promise<number> {
  let sum = 0;
  for (const id of accounts) {
    const bal = await ledger.balance(id);
    sum += bal.total;
  }
  return sum;
}
