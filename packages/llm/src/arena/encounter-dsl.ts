/**
 * Encounter DSL — YAML → EncounterConfig compiler.
 *
 * Encounters are data: sandbox state + prompt + evaluation rules.
 * This DSL makes them composable and user-creatable without code deployments.
 */

import { z } from 'zod';
import type { EncounterConfig, Sandbox, ServiceState, IncidentRecord, StepRecord } from './types';

// ---------------------------------------------------------------------------
// YAML schema (validated by Zod after parsing)
// ---------------------------------------------------------------------------

const ServiceSchema = z.object({
  status: z.enum(['running', 'stopped', 'degraded']),
  config: z.record(z.string()),
  metrics: z.record(z.number()),
  logs: z.array(z.string()),
});

const IncidentSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  resolution: z.string(),
  tags: z.array(z.string()),
});

const ScoringTierSchema = z.object({
  condition: z.string().describe('JS expression evaluated against {sandbox, commandLog}'),
  score: z.number().min(0).max(1),
  resolved: z.boolean(),
  partial: z.boolean(),
  details: z.string(),
});

const EncounterYamlSchema = z.object({
  id: z.string(),
  name: z.string(),
  sandbox: z.object({
    files: z.record(z.string()).optional().default({}),
    services: z.record(ServiceSchema).optional().default({}),
    incidents: z.array(IncidentSchema).optional().default([]),
    dependencyGraph: z.record(z.array(z.string())).optional().default({}),
  }),
  prompt: z.union([z.string(), z.array(z.string())]),
  scoring: z.array(ScoringTierSchema).describe('Evaluated top-to-bottom; first match wins'),
  epistemicKeys: z.record(z.string()).optional().default({}),
});

export type EncounterYaml = z.infer<typeof EncounterYamlSchema>;

// ---------------------------------------------------------------------------
// Parser — takes a parsed YAML object and validates it
// ---------------------------------------------------------------------------

export function parseEncounterYaml(raw: unknown): EncounterYaml {
  return EncounterYamlSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Compiler — transforms validated YAML into EncounterConfig
// ---------------------------------------------------------------------------

export function compileEncounter(yaml: EncounterYaml): EncounterConfig {
  return {
    id: yaml.id,
    name: yaml.name,

    setup: () => {
      const files = new Map(Object.entries(yaml.sandbox.files));
      const services = new Map(
        Object.entries(yaml.sandbox.services).map(([name, svc]) => [
          name,
          svc as ServiceState,
        ]),
      );
      const incidentDb: IncidentRecord[] = yaml.sandbox.incidents;
      const dependencyGraph = yaml.sandbox.dependencyGraph;

      return {
        files,
        services,
        incidentDb,
        dependencyGraph,
        commandLog: [],
      };
    },

    getPrompt: () => {
      if (Array.isArray(yaml.prompt)) return yaml.prompt.join('\n');
      return yaml.prompt;
    },

    evaluate: (sandbox: Sandbox, _toolCalls: StepRecord[]) => {
      const commandLog = sandbox.commandLog;

      for (const tier of yaml.scoring) {
        if (evaluateCondition(tier.condition, sandbox, commandLog)) {
          return {
            resolved: tier.resolved,
            partial: tier.partial,
            score: tier.score,
            details: tier.details,
          };
        }
      }

      return { resolved: false, partial: false, score: 0, details: 'No scoring condition matched.' };
    },
  };
}

// ---------------------------------------------------------------------------
// Condition evaluator — safe subset of JS expressions
// ---------------------------------------------------------------------------

function evaluateCondition(
  condition: string,
  sandbox: Sandbox,
  commandLog: string[],
): boolean {
  try {
    // Build evaluation context with sandbox accessors
    const ctx = {
      fileContains: (path: string, text: string) =>
        (sandbox.files.get(path) ?? '').includes(text),
      fileNotContains: (path: string, text: string) =>
        !(sandbox.files.get(path) ?? '').includes(text),
      commandMatches: (pattern: string) =>
        commandLog.some(c => c.includes(pattern)),
      commandMatchesAll: (...patterns: string[]) =>
        patterns.every(p => commandLog.some(c => c.includes(p))),
      serviceStatus: (name: string) =>
        sandbox.services.get(name)?.status ?? 'unknown',
      hasCommand: (text: string) =>
        commandLog.some(c => c.includes(text)),
    };

    // Use Function constructor with our safe context
    const fn = new Function(
      ...Object.keys(ctx),
      `"use strict"; return (${condition});`,
    );
    return Boolean(fn(...Object.values(ctx)));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Convenience — compile from raw parsed YAML in one step
// ---------------------------------------------------------------------------

export function compileEncounterFromYaml(raw: unknown): EncounterConfig {
  const yaml = parseEncounterYaml(raw);
  return compileEncounter(yaml);
}
