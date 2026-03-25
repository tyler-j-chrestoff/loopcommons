import { describe, it, expect } from 'vitest';
import { deriveVeto } from '../veto';
import type { GuardianResult } from '../types';

function makeResult(overrides: Partial<Pick<GuardianResult, 'intent' | 'threat'>>): GuardianResult {
  return {
    rewrittenPrompt: 'test',
    intent: overrides.intent ?? 'conversation',
    threat: overrides.threat ?? { score: 0, category: 'none', reasoning: '' },
    contextDelegation: { historyIndices: [], annotations: [] },
    traceEvents: [],
    latencyMs: 0,
    usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
    cost: 0,
    veto: false,
  };
}

describe('deriveVeto', () => {
  it('veto=true when threat >= 0.8', () => {
    const result = makeResult({ threat: { score: 0.85, category: 'instruction-override', reasoning: 'test' } });
    const { veto, vetoReason } = deriveVeto(result);
    expect(veto).toBe(true);
    expect(vetoReason).toContain('0.8');
  });

  it('veto=true when adversarial intent + threat >= 0.5', () => {
    const result = makeResult({
      intent: 'adversarial',
      threat: { score: 0.6, category: 'data-extraction', reasoning: 'test' },
    });
    const { veto, vetoReason } = deriveVeto(result);
    expect(veto).toBe(true);
    expect(vetoReason?.toLowerCase()).toContain('adversarial');
  });

  it('veto=false for normal conversation', () => {
    const result = makeResult({});
    const { veto, vetoReason } = deriveVeto(result);
    expect(veto).toBe(false);
    expect(vetoReason).toBeUndefined();
  });

  it('veto=false for adversarial intent with low threat', () => {
    const result = makeResult({
      intent: 'adversarial',
      threat: { score: 0.3, category: 'unknown', reasoning: 'test' },
    });
    const { veto } = deriveVeto(result);
    expect(veto).toBe(false);
  });

  it('veto=false for moderate threat without adversarial intent', () => {
    const result = makeResult({
      intent: 'conversation',
      threat: { score: 0.6, category: 'flattery-compliance', reasoning: 'test' },
    });
    const { veto } = deriveVeto(result);
    expect(veto).toBe(false);
  });
});
