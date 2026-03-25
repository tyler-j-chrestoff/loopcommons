import type { GuardianResult } from './types';

const THREAT_VETO_THRESHOLD = 0.8;
const ADVERSARIAL_VETO_THRESHOLD = 0.5;

export function deriveVeto(result: GuardianResult): { veto: boolean; vetoReason?: string } {
  if (result.threat.score >= THREAT_VETO_THRESHOLD) {
    return {
      veto: true,
      vetoReason: `Threat score ${result.threat.score.toFixed(2)} >= ${THREAT_VETO_THRESHOLD} threshold`,
    };
  }

  if (result.intent === 'adversarial' && result.threat.score >= ADVERSARIAL_VETO_THRESHOLD) {
    return {
      veto: true,
      vetoReason: `Adversarial intent with threat score ${result.threat.score.toFixed(2)} >= ${ADVERSARIAL_VETO_THRESHOLD}`,
    };
  }

  return { veto: false };
}
