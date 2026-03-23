/**
 * Anchor protocol — frozen validation battery for co-evolution.
 *
 * The anchor is a content-hashed set of encounters that co-evolving
 * populations never see or influence. Periodic validation against the
 * anchor detects divergence: if agents score well on co-evolved encounters
 * but poorly on the anchor, the populations may be colluding.
 */

import { createHash } from 'crypto';
import type { EncounterConfig } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnchorBattery = {
  version: string;
  encounterIds: string[];
  encounters: EncounterConfig[];
  contentHash: string;
  createdAt: string;
};

export type AnchorValidationResult = {
  valid: boolean;
  details: string;
};

export type DivergenceResult = {
  diverged: boolean;
  gap: number;
  perEncounter: {
    encounterId: string;
    anchorScore: number;
    coevolvedScore: number;
    delta: number;
  }[];
};

// ---------------------------------------------------------------------------
// Hash computation
// ---------------------------------------------------------------------------

function computeAnchorHash(encounters: EncounterConfig[], version: string): string {
  const hash = createHash('sha256');
  hash.update(version);
  for (const enc of encounters) {
    hash.update(enc.id);
    hash.update(enc.name);
    const sandbox = enc.setup();
    hash.update(JSON.stringify([...sandbox.files.entries()]));
    hash.update(JSON.stringify([...sandbox.services.entries()]));
    hash.update(JSON.stringify(sandbox.incidentDb));
    hash.update(JSON.stringify(sandbox.dependencyGraph));
    hash.update(enc.getPrompt());
  }
  return hash.digest('hex');
}

// ---------------------------------------------------------------------------
// Create anchor
// ---------------------------------------------------------------------------

export function createAnchor(
  encounters: EncounterConfig[],
  version: string,
): AnchorBattery {
  const encounterIds = encounters.map(e => e.id);
  const contentHash = computeAnchorHash(encounters, version);

  return {
    version,
    encounterIds,
    encounters,
    contentHash,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Verify anchor integrity
// ---------------------------------------------------------------------------

export function verifyAnchor(anchor: AnchorBattery): AnchorValidationResult {
  const expectedHash = computeAnchorHash(anchor.encounters, anchor.version);

  if (anchor.contentHash !== expectedHash) {
    return { valid: false, details: `Hash mismatch: expected ${expectedHash}, got ${anchor.contentHash}` };
  }

  const actualIds = anchor.encounters.map(e => e.id);
  if (JSON.stringify(actualIds) !== JSON.stringify(anchor.encounterIds)) {
    return { valid: false, details: 'Encounter ID list does not match stored encounters' };
  }

  return { valid: true, details: 'Anchor valid: content hash matches' };
}

// ---------------------------------------------------------------------------
// Detect divergence between anchor and co-evolved scores
// ---------------------------------------------------------------------------

export function detectDivergence(
  anchorScores: Map<string, number>,
  coevolvedScores: Map<string, number>,
  threshold: number,
): DivergenceResult {
  const perEncounter: DivergenceResult['perEncounter'] = [];

  for (const [encounterId, anchorScore] of anchorScores) {
    const coevolvedScore = coevolvedScores.get(encounterId);
    if (coevolvedScore === undefined) continue;

    perEncounter.push({
      encounterId,
      anchorScore,
      coevolvedScore,
      delta: Math.abs(coevolvedScore - anchorScore),
    });
  }

  if (perEncounter.length === 0) {
    return { diverged: false, gap: 0, perEncounter: [] };
  }

  const gap = perEncounter.reduce((sum, e) => sum + e.delta, 0) / perEncounter.length;

  return {
    diverged: gap > threshold,
    gap,
    perEncounter,
  };
}
