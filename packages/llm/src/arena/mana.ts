/**
 * Mana system — phase-based tool gating for arena encounters.
 *
 * Agents get N exploration slots. Each exploration tool (inspect, search, model)
 * costs slots. Action tools (act, done) are always free. When exploration slots
 * are depleted, only action tools remain — forcing the agent to act or finish.
 */

export type ManaConfig = {
  explorationSlots: number;
  toolCosts: Record<string, number>;
};

export type ManaState = {
  explorationSlotsRemaining: number;
  explorationSlotsUsed: number;
};

export function createManaState(config: ManaConfig): ManaState {
  return {
    explorationSlotsRemaining: config.explorationSlots,
    explorationSlotsUsed: 0,
  };
}

export function prepareStep(
  state: ManaState,
  toolNames: string[],
  config: ManaConfig,
): string[] {
  return toolNames.filter(name => {
    const cost = config.toolCosts[name] ?? 0;
    if (cost === 0) return true;
    return state.explorationSlotsRemaining >= cost;
  });
}

export function consumeMana(
  state: ManaState,
  toolName: string,
  config: ManaConfig,
): void {
  const cost = config.toolCosts[toolName] ?? 0;
  if (cost === 0) return;
  const actual = Math.min(cost, state.explorationSlotsRemaining);
  state.explorationSlotsRemaining -= actual;
  state.explorationSlotsUsed += cost;
}
