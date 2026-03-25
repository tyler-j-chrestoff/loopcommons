export type StakeBid = {
  subsystemId: string;
  amount: number;
  purpose: string;
  timeout: number;
  correlationId: string;
};

export type StakeReceipt = {
  transferId: string;
  subsystemId: string;
  amount: number;
  purpose: string;
  stakedAt: number;
  expiresAt: number;
};

export type StakeOutcome = {
  quality: number;
};

export type TransferResult = {
  success: boolean;
  fromBalance: number;
  toBalance: number;
  energyMoved: number;
};

export type AccountBalance = {
  available: number;
  pending: number;
  total: number;
};

export type Ledger = {
  stake(bid: StakeBid): Promise<StakeReceipt>;
  resolve(receipt: StakeReceipt, outcome: StakeOutcome): Promise<TransferResult>;
  balance(accountId: string): Promise<AccountBalance>;
  fund(accountId: string, amount: number, source: string): Promise<TransferResult>;
};
