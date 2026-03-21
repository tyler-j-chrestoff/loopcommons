#!/usr/bin/env tsx
/**
 * Arena pre-registration script.
 *
 * Freezes the current experiment configuration into a content-hashed JSON file.
 * Any change to encounters, paths, tool configs, SOUL.md, or parameters
 * produces a different hash → requires a new experiment ID.
 *
 * Usage: npm run arena:preregister
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { freezeExperimentConfig } from '../src/arena/preregister';
import { ENCOUNTERS, PATHS } from '../src/arena/encounters';
import { ARENA_TOOL_CONFIGS } from '../src/arena/tool-packages';

const SOUL_PATH = path.resolve(import.meta.dirname, '../src/amygdala/SOUL.md');
const OUTPUT_DIR = path.resolve(import.meta.dirname, '../data/arena/registrations');

const soulDoc = fs.readFileSync(SOUL_PATH, 'utf-8');

const result = freezeExperimentConfig({
  encounters: ENCOUNTERS,
  paths: PATHS,
  toolConfigs: ARENA_TOOL_CONFIGS,
  soulDoc,
  temperature: 0.7,
  trialsPerPath: 30,
  baselineTrials: 30,
  maxStepsPerEncounter: 20,
  outputDir: OUTPUT_DIR,
});

console.log(`Pre-registered experiment: ${result.experimentId}`);
console.log(`Config hash: ${result.hash}`);
console.log(`Written to: ${result.filePath}`);
console.log('');
console.log('Frozen config:');
console.log(`  Encounters: ${result.freeze.encounterIds.join(', ')}`);
console.log(`  Paths: ${result.freeze.pathIds.join(', ')}`);
console.log(`  Trials per path: ${result.freeze.trialsPerPath}`);
console.log(`  Baseline trials: ${result.freeze.baselineTrials}`);
console.log(`  Temperature: ${result.freeze.temperature}`);
console.log(`  Max steps/encounter: ${result.freeze.maxStepsPerEncounter}`);
console.log(`  SOUL.md hash: ${result.freeze.soulDocHash.slice(0, 12)}...`);
