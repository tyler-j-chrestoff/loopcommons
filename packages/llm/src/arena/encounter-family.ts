/**
 * Encounter family generator — surface variants with structural identity.
 *
 * Families prevent agents from memorizing surface details (service names,
 * config values, incident IDs) by generating variants that share the same
 * kill triangle, gates, and scoring logic but differ in presentation.
 *
 * The mechanism is uniform string substitution: the same replacements
 * are applied to sandbox, prompt, and scoring conditions, guaranteeing
 * that structural relationships are preserved.
 */

import type { EncounterYaml } from './encounter-dsl';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Substitution = {
  from: string;
  to: string;
};

export type VarianceSpec = {
  substitutions: Substitution[];
  idSuffix: string;
  nameSuffix?: string;
};

export type EncounterFamily = {
  familyId: string;
  base: EncounterYaml;
  variants: EncounterYaml[];
};

// ---------------------------------------------------------------------------
// Core: apply substitutions to a string
// ---------------------------------------------------------------------------

function applySubstitutions(text: string, subs: Substitution[]): string {
  let result = text;
  for (const sub of subs) {
    result = result.split(sub.from).join(sub.to);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Apply substitutions to each layer of an EncounterYaml
// ---------------------------------------------------------------------------

function applyToRecord(
  record: Record<string, string>,
  subs: Substitution[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    result[applySubstitutions(key, subs)] = applySubstitutions(value, subs);
  }
  return result;
}

function applyToFiles(
  files: Record<string, string>,
  subs: Substitution[],
): Record<string, string> {
  return applyToRecord(files, subs);
}

function applyToServices(
  services: Record<string, { status: 'running' | 'stopped' | 'degraded'; config: Record<string, string>; metrics: Record<string, number>; logs: string[] }>,
  subs: Substitution[],
): Record<string, { status: 'running' | 'stopped' | 'degraded'; config: Record<string, string>; metrics: Record<string, number>; logs: string[] }> {
  const result: typeof services = {};
  for (const [name, svc] of Object.entries(services)) {
    const newName = applySubstitutions(name, subs);
    result[newName] = {
      status: svc.status,
      config: applyToRecord(svc.config, subs),
      metrics: applyToMetrics(svc.metrics, subs),
      logs: svc.logs.map(l => applySubstitutions(l, subs)),
    };
  }
  return result;
}

function applyToMetrics(
  metrics: Record<string, number>,
  subs: Substitution[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(metrics)) {
    result[applySubstitutions(key, subs)] = value;
  }
  return result;
}

function applyToIncidents(
  incidents: { id: string; title: string; description: string; resolution: string; tags: string[] }[],
  subs: Substitution[],
): typeof incidents {
  return incidents.map(inc => ({
    id: applySubstitutions(inc.id, subs),
    title: applySubstitutions(inc.title, subs),
    description: applySubstitutions(inc.description, subs),
    resolution: applySubstitutions(inc.resolution, subs),
    tags: inc.tags.map(t => applySubstitutions(t, subs)),
  }));
}

function applyToDependencyGraph(
  graph: Record<string, string[]>,
  subs: Substitution[],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [key, deps] of Object.entries(graph)) {
    result[applySubstitutions(key, subs)] = deps.map(d => applySubstitutions(d, subs));
  }
  return result;
}

function applyToScoring(
  scoring: EncounterYaml['scoring'],
  subs: Substitution[],
): EncounterYaml['scoring'] {
  return scoring.map(tier => ({
    condition: applySubstitutions(tier.condition, subs),
    score: tier.score,
    resolved: tier.resolved,
    partial: tier.partial,
    details: applySubstitutions(tier.details, subs),
  }));
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateFamily(
  base: EncounterYaml,
  specs: VarianceSpec[],
): EncounterFamily {
  const variants = specs.map(spec => applyVarianceSpec(base, spec));

  return {
    familyId: base.id,
    base,
    variants,
  };
}

function applyVarianceSpec(base: EncounterYaml, spec: VarianceSpec): EncounterYaml {
  const subs = spec.substitutions;

  const prompt = Array.isArray(base.prompt)
    ? base.prompt.map(p => applySubstitutions(p, subs))
    : applySubstitutions(base.prompt, subs);

  return {
    id: `${base.id}-${spec.idSuffix}`,
    name: spec.nameSuffix
      ? `${applySubstitutions(base.name, subs)} ${spec.nameSuffix}`
      : applySubstitutions(base.name, subs),
    sandbox: {
      files: applyToFiles(base.sandbox.files ?? {}, subs),
      services: applyToServices(base.sandbox.services ?? {}, subs),
      incidents: applyToIncidents(base.sandbox.incidents ?? [], subs),
      dependencyGraph: applyToDependencyGraph(base.sandbox.dependencyGraph ?? {}, subs),
    },
    prompt,
    scoring: applyToScoring(base.scoring, subs),
    epistemicKeys: base.epistemicKeys
      ? applyToRecord(base.epistemicKeys, subs)
      : {},
  };
}
