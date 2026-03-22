/**
 * GET /api/arena/encounters — list available encounters.
 * POST /api/arena/encounters — create a new YAML encounter.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { checkApiKey } from '@/lib/api-auth';

const ENCOUNTER_DIR = resolve(
  process.env.SESSION_DATA_DIR ?? process.cwd(),
  'data/arena/encounters',
);

function ensureDir() {
  if (!existsSync(ENCOUNTER_DIR)) {
    mkdirSync(ENCOUNTER_DIR, { recursive: true });
  }
}

export async function GET(request: NextRequest) {
  const authError = await checkApiKey(request);
  if (authError) return authError;

  ensureDir();

  const files = readdirSync(ENCOUNTER_DIR).filter(f => f.endsWith('.json'));
  const encounters = files.map(f => {
    try {
      const raw = JSON.parse(readFileSync(join(ENCOUNTER_DIR, f), 'utf-8'));
      return { id: raw.id, name: raw.name, file: f };
    } catch {
      return null;
    }
  }).filter(Boolean);

  return NextResponse.json({ encounters, dir: ENCOUNTER_DIR });
}

export async function POST(request: NextRequest) {
  const authError = await checkApiKey(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate using the DSL parser
  try {
    const { parseEncounterYaml } = await import('@loopcommons/llm/arena');
    const parsed = parseEncounterYaml(body);

    ensureDir();
    const filePath = join(ENCOUNTER_DIR, `${parsed.id}.json`);
    writeFileSync(filePath, JSON.stringify(parsed, null, 2));

    return NextResponse.json({ id: parsed.id, name: parsed.name, file: `${parsed.id}.json` }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid encounter definition', details: String(err) },
      { status: 400 },
    );
  }
}
