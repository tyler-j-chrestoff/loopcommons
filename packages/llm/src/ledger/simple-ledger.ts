import type {
  Ledger,
  StakeBid,
  StakeReceipt,
  StakeOutcome,
  TransferResult,
  AccountBalance,
} from './types';

type Account = {
  available: number;
  pending: number;
};

type PendingStake = {
  receipt: StakeReceipt;
  accountId: string;
};

const DEFAULT_REWARD_RATE = 0.5;

let nextTransferId = 0;

export function createSimpleLedger(rewardRate = DEFAULT_REWARD_RATE): Ledger {
  const accounts = new Map<string, Account>();
  const pendingStakes = new Map<string, PendingStake>();

  function getOrCreate(id: string): Account {
    let acct = accounts.get(id);
    if (!acct) {
      acct = { available: 0, pending: 0 };
      accounts.set(id, acct);
    }
    return acct;
  }

  const ledger: Ledger = {
    async stake(bid: StakeBid): Promise<StakeReceipt> {
      const acct = getOrCreate(bid.subsystemId);
      if (acct.available < bid.amount) {
        throw new Error(
          `Insufficient balance: ${bid.subsystemId} has ${acct.available} available, needs ${bid.amount}`,
        );
      }

      acct.available -= bid.amount;
      acct.pending += bid.amount;

      const receipt: StakeReceipt = {
        transferId: `tx-${++nextTransferId}`,
        subsystemId: bid.subsystemId,
        amount: bid.amount,
        purpose: bid.purpose,
        stakedAt: Date.now(),
        expiresAt: Date.now() + bid.timeout * 1000,
      };

      pendingStakes.set(receipt.transferId, {
        receipt,
        accountId: bid.subsystemId,
      });

      return receipt;
    },

    async resolve(receipt: StakeReceipt, outcome: StakeOutcome): Promise<TransferResult> {
      const pending = pendingStakes.get(receipt.transferId);
      if (!pending) {
        throw new Error(`Unknown or already resolved stake: ${receipt.transferId}`);
      }

      pendingStakes.delete(receipt.transferId);
      const acct = getOrCreate(pending.accountId);

      const consumed = receipt.amount * (1 - outcome.quality * rewardRate);
      const returned = receipt.amount - consumed;

      acct.pending -= receipt.amount;
      acct.available += returned;

      return {
        success: true,
        energyMoved: consumed,
        fromBalance: acct.available,
        toBalance: acct.available,
      };
    },

    async balance(accountId: string): Promise<AccountBalance> {
      const acct = accounts.get(accountId);
      if (!acct) {
        return { available: 0, pending: 0, total: 0 };
      }
      return {
        available: acct.available,
        pending: acct.pending,
        total: acct.available + acct.pending,
      };
    },

    async fund(accountId: string, amount: number, _source: string): Promise<TransferResult> {
      const acct = getOrCreate(accountId);
      acct.available += amount;
      return {
        success: true,
        energyMoved: amount,
        fromBalance: 0,
        toBalance: acct.available,
      };
    },
  };

  return ledger;
}
