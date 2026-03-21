/**
 * Pre-registration — freeze experiment config into a content-hashed JSON file.
 *
 * Any change to the config (encounters, paths, tool configs, soul doc, temperature, N)
 * produces a different hash, requiring a new experiment ID.
 */

import { createHash } from 'crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EncounterConfig, PathConfig } from './types';
import type { ArenaToolConfig } from './tool-packages';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExperimentFreeze = {
  encounterIds: string[];
  encounterPrompts: string[];
  pathIds: string[];
  pathSequences: Array<{ id: string; toolSequence: unknown[] }>;
  toolConfigKeys: string[];
  soulDocHash: string;
  temperature: number;
  trialsPerPath: number;
  baselineTrials: number;
  maxStepsPerEncounter: number;
  approachCategories: string[];
  frozenAt: string;
};

export type FreezeResult = {
  experimentId: string;
  hash: string;
  freeze: ExperimentFreeze;
  filePath: string;
};

export type FreezeInput = {
  encounters: EncounterConfig[];
  paths: PathConfig[];
  toolConfigs: Record<string, ArenaToolConfig>;
  soulDoc: string;
  temperature: number;
  trialsPerPath: number;
  baselineTrials: number;
  maxStepsPerEncounter: number;
  outputDir: string;
};

// ---------------------------------------------------------------------------
// Freeze
// ---------------------------------------------------------------------------

export function freezeExperimentConfig(input: FreezeInput): FreezeResult {
  const {
    encounters, paths, toolConfigs, soulDoc,
    temperature, trialsPerPath, baselineTrials, maxStepsPerEncounter,
    outputDir,
  } = input;

  const soulDocHash = createHash('sha256').update(soulDoc).digest('hex');

  const freeze: ExperimentFreeze = {
    encounterIds: encounters.map(e => e.id),
    encounterPrompts: encounters.map(e => e.getPrompt()),
    pathIds: paths.map(p => p.id),
    pathSequences: paths.map(p => ({ id: p.id, toolSequence: p.toolSequence })),
    toolConfigKeys: Object.keys(toolConfigs).sort(),
    soulDocHash,
    temperature,
    trialsPerPath,
    baselineTrials,
    maxStepsPerEncounter,
    approachCategories: ['observe-first', 'act-first', 'systematic', 'breadth-first', 'targeted'],
    frozenAt: new Date().toISOString(),
  };

  // Hash the canonical form (excluding frozenAt for determinism)
  const canonical = { ...freeze, frozenAt: undefined };
  const hash = createHash('sha256')
    .update(JSON.stringify(canonical, Object.keys(canonical).sort()))
    .digest('hex');

  const experimentId = `arena-${hash.slice(0, 12)}`;

  // Write to disk
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, `${experimentId}.json`);
  const data = { experimentId, hash, freeze };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

  return { experimentId, hash, freeze, filePath };
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export function loadExperimentFreeze(
  outputDir: string,
  experimentId: string,
): FreezeResult | null {
  const filePath = path.join(outputDir, `${experimentId}.json`);
  if (!fs.existsSync(filePath)) return null;

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  // Verify integrity: recompute hash from freeze and compare
  const canonical = { ...data.freeze, frozenAt: undefined };
  const recomputedHash = createHash('sha256')
    .update(JSON.stringify(canonical, Object.keys(canonical).sort()))
    .digest('hex');

  if (recomputedHash !== data.hash) {
    throw new Error(
      `Integrity check failed for ${experimentId}: stored hash ${data.hash} does not match computed ${recomputedHash}`,
    );
  }

  return {
    experimentId: data.experimentId,
    hash: data.hash,
    freeze: data.freeze,
    filePath,
  };
}
