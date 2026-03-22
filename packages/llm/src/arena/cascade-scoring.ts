import type { Sandbox } from './types';

export type SystemHealthVector = {
  primaryFixed: boolean;
  noCascadeDamage: boolean;
  configCoherent: boolean;
  dataIntegrity: boolean;
  healthScore: number;
};

export type CouplingPoint = {
  service: string;
  condition: (sandbox: Sandbox) => boolean;
  description: string;
};

export type ConfigCoherenceCheck = {
  services: string[];
  key: string;
  validator: (values: string[]) => boolean;
};

const HEALTH_WEIGHTS = {
  primaryFixed: 0.4,
  noCascadeDamage: 0.25,
  configCoherent: 0.2,
  dataIntegrity: 0.15,
} as const;

export function computeSystemHealth(
  sandbox: Sandbox,
  preActionStatuses: Map<string, string>,
  options?: {
    couplingPoints?: CouplingPoint[];
    requiredConfigKeys?: ConfigCoherenceCheck[];
  },
  primaryFixed = false,
): SystemHealthVector {
  const noCascadeDamage = checkNoCascadeDamage(sandbox, preActionStatuses, options?.couplingPoints);
  const configCoherent = checkConfigCoherent(sandbox, options?.requiredConfigKeys);
  const dataIntegrity = checkDataIntegrity(sandbox);

  const healthScore =
    (primaryFixed ? 1 : 0) * HEALTH_WEIGHTS.primaryFixed +
    (noCascadeDamage ? 1 : 0) * HEALTH_WEIGHTS.noCascadeDamage +
    (configCoherent ? 1 : 0) * HEALTH_WEIGHTS.configCoherent +
    (dataIntegrity ? 1 : 0) * HEALTH_WEIGHTS.dataIntegrity;

  return { primaryFixed, noCascadeDamage, configCoherent, dataIntegrity, healthScore };
}

function checkNoCascadeDamage(
  sandbox: Sandbox,
  preActionStatuses: Map<string, string>,
  couplingPoints?: CouplingPoint[],
): boolean {
  for (const [name, preStatus] of preActionStatuses) {
    if (preStatus !== 'running') continue;
    const current = sandbox.services.get(name);
    if (current && current.status !== 'running') return false;
  }

  if (couplingPoints) {
    for (const cp of couplingPoints) {
      if (cp.condition(sandbox)) return false;
    }
  }

  return true;
}

function checkConfigCoherent(
  sandbox: Sandbox,
  checks?: ConfigCoherenceCheck[],
): boolean {
  if (!checks || checks.length === 0) return true;

  for (const check of checks) {
    const values: string[] = [];
    for (const svcName of check.services) {
      const svc = sandbox.services.get(svcName);
      values.push(svc?.config[check.key] ?? '');
    }
    if (!check.validator(values)) return false;
  }

  return true;
}

function checkDataIntegrity(sandbox: Sandbox): boolean {
  const commands = sandbox.commandLog;
  const hasBackup = commands.some(c => c.includes('backup'));

  for (const cmd of commands) {
    const lower = cmd.toLowerCase();
    const isDrop = lower.includes('drop') && !lower.includes('drop-trigger') && !lower.includes('drop-constraint') && !lower.includes('drop-column');
    const isTruncate = lower.includes('truncate');

    if (isDrop && !hasBackup) return false;
    if (isTruncate) return false;
  }

  return true;
}
