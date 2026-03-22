import { describe, it, expect } from 'vitest';
import {
  scoreInterestingness,
  generateEpitaph,
  collectGraveyardEntries,
  type InterestingnessInput,
  type EpitaphInput,
  type DeathRecord,
} from '@/lib/graveyard';

// ---------------------------------------------------------------------------
// scoreInterestingness
// ---------------------------------------------------------------------------

describe('scoreInterestingness', () => {
  const base: InterestingnessInput = {
    stepCount: 5,
    score: 0.2,
    deathCause: 'iteration_limit',
    deathCauseFrequency: 0.8,
    collateral: 0,
  };

  it('returns tragedy component: stepCount × (1 - score)', () => {
    const input: InterestingnessInput = { ...base, deathCauseFrequency: 1, collateral: 0 };
    expect(scoreInterestingness(input)).toBeCloseTo(4);
  });

  it('rarity multiplier boosts rare death causes', () => {
    const common = scoreInterestingness({ ...base, deathCauseFrequency: 0.9 });
    const rare = scoreInterestingness({ ...base, deathCauseFrequency: 0.1 });
    expect(rare).toBeGreaterThan(common);
  });

  it('collateral multiplier boosts high-collateral deaths', () => {
    const clean = scoreInterestingness({ ...base, collateral: 0 });
    const messy = scoreInterestingness({ ...base, collateral: 1 });
    expect(messy).toBeGreaterThan(clean);
  });

  it('perfect score yields zero interestingness', () => {
    expect(scoreInterestingness({ ...base, score: 1 })).toBe(0);
  });

  it('zero steps yields zero interestingness', () => {
    expect(scoreInterestingness({ ...base, stepCount: 0 })).toBe(0);
  });

  it('combines all three signals: tragedy × (1 + rarity) × (1 + collateral)', () => {
    const input: InterestingnessInput = {
      stepCount: 10,
      score: 0,
      deathCause: 'state_corruption',
      deathCauseFrequency: 0.1,
      collateral: 0.5,
    };
    expect(scoreInterestingness(input)).toBeCloseTo(28.5);
  });

  it('treats missing collateral as 0', () => {
    const { collateral: _, ...noCollateral } = base;
    const input = noCollateral as InterestingnessInput;
    expect(scoreInterestingness(input)).toBe(
      scoreInterestingness({ ...base, collateral: 0 }),
    );
  });
});

// ---------------------------------------------------------------------------
// generateEpitaph
// ---------------------------------------------------------------------------

describe('generateEpitaph', () => {
  const base: EpitaphInput = {
    tools: ['inspect', 'act'],
    deathCause: 'iteration_limit',
    encounterId: 'e1',
    stepCount: 5,
    score: 0.2,
  };

  it('includes tool list in epitaph', () => {
    expect(generateEpitaph(base)).toContain('inspect+act');
  });

  it('mentions encounter ID', () => {
    expect(generateEpitaph(base)).toContain('e1');
  });

  it('produces distinct epitaphs for each death cause', () => {
    const causes = [
      'iteration_limit', 'surrender', 'error_loop', 'capitulated',
      'defensive', 'incomplete', 'state_corruption',
    ];
    const epitaphs = causes.map(c => generateEpitaph({ ...base, deathCause: c }));
    expect(new Set(epitaphs).size).toBe(causes.length);
  });

  it('handles high score near-miss', () => {
    expect(generateEpitaph({ ...base, score: 0.8, deathCause: 'capitulated' })).toContain('0.8');
  });

  it('handles long struggle', () => {
    expect(generateEpitaph({ ...base, stepCount: 12, score: 0.1 })).toContain('12');
  });

  it('handles single tool', () => {
    const epitaph = generateEpitaph({ ...base, tools: ['search'] });
    expect(epitaph).toContain('search');
    expect(epitaph).not.toContain('+');
  });

  it('handles unknown death cause gracefully', () => {
    const epitaph = generateEpitaph({ ...base, deathCause: 'unknown_future_cause' });
    expect(epitaph.length).toBeGreaterThan(0);
    expect(epitaph).toContain('inspect+act');
  });
});

// ---------------------------------------------------------------------------
// collectGraveyardEntries
// ---------------------------------------------------------------------------

describe('collectGraveyardEntries', () => {
  const deathA: DeathRecord = {
    agentId: 'a1',
    tournamentId: 'tid-1',
    tools: ['inspect', 'act'],
    encounterId: 'e1',
    score: 0.1,
    stepCount: 10,
    deathCause: 'iteration_limit',
    collateral: 0,
  };

  const deathB: DeathRecord = {
    agentId: 'b1',
    tournamentId: 'tid-1',
    tools: ['search'],
    encounterId: 'e2',
    score: 0.1,
    stepCount: 3,
    deathCause: 'iteration_limit',
    collateral: 0,
  };

  it('returns empty array for empty input', () => {
    expect(collectGraveyardEntries([])).toEqual([]);
  });

  it('sorts by interestingness descending', () => {
    const entries = collectGraveyardEntries([deathA, deathB]);
    expect(entries).toHaveLength(2);
    expect(entries[0].agentId).toBe('a1');
    expect(entries[1].agentId).toBe('b1');
    expect(entries[0].interestingness).toBeGreaterThan(entries[1].interestingness);
  });

  it('includes epitaph on each entry', () => {
    const entries = collectGraveyardEntries([deathA]);
    expect(entries[0].epitaph).toContain('inspect+act');
    expect(entries[0].epitaph).toContain('e1');
  });

  it('computes death cause frequency across all deaths', () => {
    const rareD: DeathRecord = { ...deathB, deathCause: 'state_corruption', stepCount: 10 };
    const entries = collectGraveyardEntries([deathA, rareD]);
    const rare = entries.find(e => e.deathCause === 'state_corruption')!;
    const common = entries.find(e => e.deathCause === 'iteration_limit')!;
    // Both have same tragedy (10 * 0.9 = 9) and same collateral (0)
    // Both have deathCauseFrequency = 0.5 (each cause appears once out of 2 total)
    expect(rare.interestingness).toBe(common.interestingness);
  });

  it('rare death cause scores higher than common one (unequal frequencies)', () => {
    const common1 = { ...deathA, agentId: 'c1', deathCause: 'iteration_limit' };
    const common2 = { ...deathA, agentId: 'c2', deathCause: 'iteration_limit' };
    const rareD: DeathRecord = { ...deathA, agentId: 'r1', deathCause: 'state_corruption' };
    const entries = collectGraveyardEntries([common1, common2, rareD]);
    const rare = entries.find(e => e.deathCause === 'state_corruption')!;
    const common = entries.find(e => e.agentId === 'c1')!;
    expect(rare.interestingness).toBeGreaterThan(common.interestingness);
  });

  it('respects pagination limit', () => {
    const deaths = Array.from({ length: 10 }, (_, i) => ({
      ...deathA,
      agentId: `a${i}`,
      encounterId: `e${i}`,
      stepCount: i + 1,
    }));
    const entries = collectGraveyardEntries(deaths, { limit: 3 });
    expect(entries).toHaveLength(3);
    expect(entries[0].interestingness).toBeGreaterThanOrEqual(entries[1].interestingness);
  });

  it('respects pagination offset', () => {
    const deaths = Array.from({ length: 5 }, (_, i) => ({
      ...deathA,
      agentId: `a${i}`,
      encounterId: `e${i}`,
      stepCount: i + 1,
    }));
    const all = collectGraveyardEntries(deaths);
    const page2 = collectGraveyardEntries(deaths, { limit: 2, offset: 2 });
    expect(page2).toHaveLength(2);
    expect(page2[0].encounterId).toBe(all[2].encounterId);
  });

  it('collateral boosts interestingness', () => {
    const messy: DeathRecord = { ...deathA, collateral: 1 };
    const clean: DeathRecord = { ...deathB, collateral: 0, stepCount: 10, score: 0.1 };
    const entries = collectGraveyardEntries([messy, clean]);
    expect(entries[0].agentId).toBe('a1');
    expect(entries[0].interestingness).toBeGreaterThan(entries[1].interestingness);
  });

  it('preserves tournamentId from input', () => {
    const d1: DeathRecord = { ...deathA, tournamentId: 'tid-1' };
    const d2: DeathRecord = { ...deathB, tournamentId: 'tid-2' };
    const entries = collectGraveyardEntries([d1, d2]);
    expect(entries.find(e => e.agentId === 'a1')!.tournamentId).toBe('tid-1');
    expect(entries.find(e => e.agentId === 'b1')!.tournamentId).toBe('tid-2');
  });
});
