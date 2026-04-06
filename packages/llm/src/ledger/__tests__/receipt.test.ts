import { describe, it, expect } from 'vitest';
import { renderReceipt, renderConsolidationReceipt } from '../receipt';
import type { StakeReceipt } from '../types';
import type { ConsolidatorTraceEvent } from '../../consolidator/types';

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

describe('renderConsolidationReceipt', () => {
  it('renders channel provenance for web', () => {
    const event: ConsolidatorTraceEvent = {
      type: 'consolidator:write',
      stored: 2,
      merged: 0,
      pruned: 0,
      gatingBand: 'full',
      threatScore: 0.1,
      provenance: { channelType: 'web', threadId: 'session-1', timestamp: 1711300000000 },
      latencyMs: 5,
      timestamp: 1711300000000,
    };
    const output = renderConsolidationReceipt([event]);
    expect(output).toContain('web');
    expect(output).toContain('2 memories stored');
  });

  it('renders channel provenance for SMS', () => {
    const event: ConsolidatorTraceEvent = {
      type: 'consolidator:write',
      stored: 1,
      merged: 0,
      pruned: 0,
      gatingBand: 'full',
      threatScore: 0.05,
      provenance: { channelType: 'sms', threadId: '+15551234567', timestamp: 1711300000000 },
      latencyMs: 3,
      timestamp: 1711300000000,
    };
    const output = renderConsolidationReceipt([event]);
    expect(output).toContain('sms');
    expect(output).toContain('1 memory stored');
  });

  it('renders multi-channel provenance', () => {
    const events: ConsolidatorTraceEvent[] = [
      {
        type: 'consolidator:write',
        stored: 1,
        merged: 0,
        pruned: 0,
        gatingBand: 'full',
        threatScore: 0.1,
        provenance: { channelType: 'web', threadId: 'sess-1', timestamp: 1711300000000 },
        latencyMs: 5,
        timestamp: 1711300000000,
      },
      {
        type: 'consolidator:write',
        stored: 2,
        merged: 0,
        pruned: 0,
        gatingBand: 'full',
        threatScore: 0.05,
        provenance: { channelType: 'sms', threadId: '+15551234567', timestamp: 1711400000000 },
        latencyMs: 3,
        timestamp: 1711400000000,
      },
    ];
    const output = renderConsolidationReceipt(events);
    expect(output).toContain('web');
    expect(output).toContain('sms');
    expect(output).toContain('3 memories stored');
  });

  it('shows blocked gating band', () => {
    const event: ConsolidatorTraceEvent = {
      type: 'consolidator:write',
      stored: 0,
      merged: 0,
      pruned: 0,
      gatingBand: 'blocked',
      threatScore: 0.6,
      provenance: { channelType: 'sms', threadId: '+15551234567', timestamp: 1711300000000 },
      latencyMs: 1,
      timestamp: 1711300000000,
    };
    const output = renderConsolidationReceipt([event]);
    expect(output).toContain('blocked');
    expect(output).toContain('0 memories stored');
  });

  it('returns empty string for no events', () => {
    expect(renderConsolidationReceipt([])).toBe('');
  });
});
