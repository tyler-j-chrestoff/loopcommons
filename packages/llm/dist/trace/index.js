export * from './events';
export function createTrace(model, provider, opts) {
    return {
        id: crypto.randomUUID(),
        startedAt: Date.now(),
        model,
        provider,
        system: opts.system,
        config: { maxRounds: opts.maxRounds },
        rounds: [],
        totalUsage: { inputTokens: 0, outputTokens: 0 },
        totalCost: 0,
        status: 'running',
    };
}
