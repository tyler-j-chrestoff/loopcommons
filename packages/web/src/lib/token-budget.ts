/**
 * TokenBudgetAccumulator — tracks per-turn and cumulative token usage
 * for one conversation, enabling real-time context budget visualization.
 *
 * ctx-02: Core accumulator implementation.
 *
 * Sources:
 *   - 'amygdala': metacognitive security layer (generateObject)
 *   - 'orchestrator': deterministic routing (zero tokens for refusal)
 *   - 'subagent': the downstream agent that generates the response
 *
 * Pricing: Haiku 4.5 — $1.00/MTok input, $0.10/MTok cache read,
 *   $1.25/MTok cache creation, $5.00/MTok output.
 */

export type TokenSource = 'amygdala' | 'orchestrator' | 'subagent';

export type ActualUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
};

export type Turn = {
  turnIndex: number;
  source: TokenSource;
  actual: Required<ActualUsage>;
};

export type CumulativeTokens = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
};

export type BudgetSnapshot = {
  cumulative: CumulativeTokens;
  budgetPercent: number;
  costEstimate: number;
  modelContextLimit: number;
  turns: Turn[];
};

export type TokenBudgetConfig = {
  modelContextLimit?: number;
};

// Haiku 4.5 pricing per million tokens
const PRICING = {
  input: 1.0,
  cacheRead: 0.1,
  cacheCreation: 1.25,
  output: 5.0,
};

export class TokenBudgetAccumulator {
  private readonly modelContextLimit: number;
  private turns: Turn[] = [];
  private cumulative: CumulativeTokens = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 0,
  };

  constructor(config: TokenBudgetConfig = {}) {
    this.modelContextLimit = config.modelContextLimit ?? 200_000;
  }

  addActual(source: TokenSource, usage: ActualUsage): void {
    const actual: Required<ActualUsage> = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens ?? 0,
      cacheCreationTokens: usage.cacheCreationTokens ?? 0,
    };

    this.turns.push({
      turnIndex: this.turns.length,
      source,
      actual,
    });

    this.cumulative.inputTokens += actual.inputTokens;
    this.cumulative.outputTokens += actual.outputTokens;
    this.cumulative.cacheReadTokens += actual.cacheReadTokens;
    this.cumulative.cacheCreationTokens += actual.cacheCreationTokens;
    this.cumulative.totalTokens = this.cumulative.inputTokens + this.cumulative.outputTokens;
  }

  getCumulative(): CumulativeTokens {
    return { ...this.cumulative };
  }

  getTurns(): Turn[] {
    return [...this.turns];
  }

  /**
   * Budget percent based on cumulative input tokens vs model context limit.
   * Output tokens don't count against the context window.
   * Clamped to [0, 100].
   */
  getBudgetPercent(): number {
    if (this.modelContextLimit <= 0) return 0;
    const pct = (this.cumulative.inputTokens / this.modelContextLimit) * 100;
    return Math.min(100, Math.max(0, Math.round(pct * 100) / 100));
  }

  /**
   * Cost estimate using Haiku 4.5 pricing with cached token discounts.
   *
   * Anthropic reports inputTokens as UNCACHED new tokens (excludes cache reads/creation).
   * So total cost = uncached * base + cacheRead * 0.1x + cacheCreation * 1.25x + output * outputRate.
   */
  getCostEstimate(): number {
    const c = this.cumulative;
    return (
      (c.inputTokens * PRICING.input +
        c.cacheReadTokens * PRICING.cacheRead +
        c.cacheCreationTokens * PRICING.cacheCreation +
        c.outputTokens * PRICING.output) /
      1_000_000
    );
  }

  getSnapshot(): BudgetSnapshot {
    return {
      cumulative: this.getCumulative(),
      budgetPercent: this.getBudgetPercent(),
      costEstimate: this.getCostEstimate(),
      modelContextLimit: this.modelContextLimit,
      turns: this.getTurns(),
    };
  }
}
