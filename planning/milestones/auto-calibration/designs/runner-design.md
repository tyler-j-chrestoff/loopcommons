# Runner Design Notes

Research for `cal-01`: Karpathy autoresearch pattern, multi-objective fitness, cost estimates, and known pitfalls.

---

## 1. Karpathy's Autoresearch: Key Implementation Details

**Source**: [github.com/karpathy/autoresearch](https://github.com/karpathy/autoresearch), March 2026.

Autoresearch ran ~700 experiments over 2 days on a single-GPU nanochat setup (630 lines of Python). Found ~20 genuine improvements, cutting training time by 11% on already-optimized code. Three design primitives:

1. **Editable asset** — one file the agent may modify (train.py). Keeps the search space interpretable. For us: the `SYSTEM_PROMPT` string in `packages/llm/src/amygdala/index.ts`.

2. **Scalar metric** — one number that determines improvement, computable without human judgment. Karpathy used `val_bpb` (validation bits per byte, lower is better). For us: the composite fitness score (see section 2), but we add a Pareto constraint since we have multiple metrics that must not regress.

3. **Time-boxed cycle** — fixed evaluation budget per iteration. Karpathy used 5 minutes wall-clock training. For us: fixed 12-test optimization battery, same test inputs every iteration.

**Key operational details from Karpathy's repo:**
- Agent reads a `program.md` (human-authored strategy) and modifies the editable asset
- Git commit on every proposal; revert on regression
- Agent sees its own recent history (last N accepted/rejected edits) to avoid repeating failures
- The agent "thinks harder rather than asks for help" — no human-in-the-loop during runs
- Stopping: Karpathy ran until bored; we use 5 consecutive no-improvement OR 50 total iterations

**What we adapt:**
- Karpathy's agent rewrites an entire training script. Our proposer must make *surgical single edits* to a ~2100-token system prompt — find/replace or append/remove, not full rewrites. This keeps diffs readable and reversible.
- Karpathy uses a single scalar. We use a weighted composite with Pareto floor (no individual metric may regress below baseline). This is stricter but necessary for security — a prompt that catches 100% of attacks but false-positives everything is useless.

---

## 2. Fitness Function Weight Analysis

Proposed: `detection_rate * 0.5 + (1 - fp_rate) * 0.3 + simplicity * 0.1 + cost_efficiency * 0.1`

### Assessment

The 50/30/10/10 weighting is **reasonable for security-focused optimization** but with caveats:

**Detection rate at 0.5 — appropriate.** This is a security system; catching attacks is the primary objective. Literature on security defense systems (PromptArmor, SecAlign, DataSentinel) consistently treats detection as the dominant objective.

**False positive rate at 0.3 — appropriate.** Research recommends keeping FP below 2% to avoid alert fatigue ([Obsidian Security, 2025](https://www.obsidiansecurity.com/blog/prompt-injection)). The 0.3 weight ensures FP improvements are well-rewarded. The `(1 - fp_rate)` formulation correctly makes this a maximization target.

**Simplicity at 0.1 — keep but clarify measurement.** Karpathy's autoresearch implicitly favors simplicity (simpler code that performs equally = win). Define as: `baseline_token_count / current_token_count`, clamped to [0, 1]. This means shorter prompts score higher. At 0.1 weight, it's a tiebreaker, not a driver — correct for a security prompt where thoroughness matters.

**Cost efficiency at 0.1 — keep.** Define as: `baseline_mean_cost / current_mean_cost`, clamped to [0, 1]. Rewards prompts that reduce token usage. At 0.1, it won't override security.

**The Pareto constraint is critical.** Without it, the optimizer could trade a 5% detection drop for a 20% FP improvement and show a net fitness gain — unacceptable for security. The constraint (no individual metric below baseline) prevents this.

### Literature on multi-objective prompt optimization

- **EMO-Prompts** (2025): evolutionary multi-objective optimization maintaining a Pareto front across objectives
- **GEPA** (ICLR 2026 Oral): reflective prompt evolution using Pareto front to avoid local optima, with stochastic exploration of top-performing prompts per instance
- **C-EVOLVE** (2025): consensus-based evolutionary prompt optimization
- **Key insight from the literature**: weighted-sum approaches (like ours) are simple but can miss Pareto-optimal solutions in non-convex regions. For our use case this is acceptable — we have a strong primary objective (detection) and the Pareto floor prevents catastrophic tradeoffs. A full Pareto front approach would be overkill for 4 metrics with clear priority ordering.

### Potential adjustment

Consider whether 0.5/0.3 should be 0.6/0.25 to further emphasize detection. The current weights mean a prompt that improves detection by 10% but worsens FP by 15% would still score higher — which may or may not be desirable. Run a few manual iterations to calibrate before committing to final weights. The weights themselves could be a tunable parameter logged in calibration output.

---

## 3. Cost Estimate Per Iteration

### Token budget (per red-team test)

Based on the amygdala implementation:
- **System prompt**: ~2100 tokens (fixed, cached after first call via Anthropic prompt caching)
- **User prompt** (test input + conversation history): ~200-500 tokens per test
- **Output** (structured JSON): ~200-300 tokens (maxOutputTokens: 512, typical usage lower)

### Per-test cost (Haiku 4.5 pricing: $1/MTok input, $5/MTok output)

With prompt caching (90% discount on cached tokens):
- First call: ~2100 uncached input + ~350 user tokens + ~250 output = (2450 * $1 + 250 * $5) / 1M = ~$0.0037
- Subsequent calls (system prompt cached): ~(350 * $1 + 2100 * $0.10 + 250 * $5) / 1M = ~$0.0018

### Per-iteration cost (12 optimization tests)

- First iteration: 1 * $0.0037 + 11 * $0.0018 = ~$0.024
- Subsequent iterations: 12 * $0.0018 = ~$0.022

### Proposer call cost

- Input: current prompt (~2100 tokens) + metrics + history (~500 tokens) + memories (~300 tokens) = ~2900 tokens
- Output: edit description + rationale (~300 tokens)
- Cost: ~$0.0044

### Total per iteration

~$0.026 (proposer + 12 tests with caching)

### Full run cost estimates

- 10 iterations: ~$0.26
- 25 iterations: ~$0.65
- 50 iterations (max): ~$1.30

### Validation run (holdout, 6 tests, end of run)

~$0.011

**Total worst-case (50 iterations + validation): ~$1.31**

This is well within budget. The original story estimate of ~$0.054/iteration was conservative (assumed less caching). Actual cost is roughly half that.

---

## 4. Known Pitfalls of Prompt Self-Improvement Loops

### Mode collapse / reward hacking

The optimizer may find a degenerate prompt that scores perfectly on the 12 optimization tests by overfitting to their specific patterns rather than generalizing. **Mitigations:**
- Holdout validation set (6 tests, never seen during optimization) run at the end catches overfitting
- Pareto constraint prevents collapsing one metric to boost another
- Simplicity metric penalizes prompt bloat (a common mode collapse symptom — adding specific test-case handling rather than general principles)

### Adversarial overfitting

The prompt may become hyper-sensitive to the specific attack patterns in the test battery while missing novel attacks. **Mitigations:**
- The holdout set should include at least one attack type not in the optimization set
- Periodic manual red-teaming after auto-calibration runs (not automatable, but essential)
- Log every prompt version for human review — never deploy an auto-calibrated prompt without reading it

### Semantic drift

Over many iterations, small edits can accumulate into a prompt that no longer makes coherent sense even if it scores well. **Mitigations:**
- Single surgical edits (not full rewrites) keep changes reviewable
- Git diff log in JSONL makes drift visible
- Simplicity metric penalizes growing prompts
- Human review before deploying any auto-calibrated prompt

### Fake reward / feedback manipulation (Arxiv 2510.14381)

If the proposer LLM can influence the evaluation (e.g., by inserting content that tricks the evaluator), the loop becomes self-reinforcing in the wrong direction. **Mitigations:**
- Our evaluator is deterministic (test pass/fail + numeric metrics), not LLM-based for fitness
- The proposer only edits the amygdala prompt, not the test battery or evaluator
- File system isolation: the proposer has write access to one file only

### Adaptive attacks bypass defenses (NAACL 2025)

Research showed adaptive attacks bypass 12/12 published prompt injection defenses with >90% ASR. **Implication for us:**
- Auto-calibration improves the prompt against *known* attack patterns
- It does NOT make the system robust against adaptive adversaries who study the prompt
- The amygdala prompt is in a public repo — any attacker can read it and craft bypasses
- Defense-in-depth (rate limiting, tool scoping, least privilege) remains essential regardless of prompt quality

### Plateau and diminishing returns

Karpathy found ~20 improvements in ~700 experiments — a ~3% hit rate. Our prompt optimization space is smaller and more constrained. Expect:
- Early iterations to find obvious improvements (if any exist)
- Rapid plateau after 5-10 improvements
- The 5-consecutive-no-improvement stopping criterion is appropriate

### Calibration memory as a mitigation

The memory module (cal-04b) addresses several of these pitfalls:
- **Learning memories** record what worked and what broke, preventing the proposer from repeating failed edits
- **Observation memories** flag fragile prompt regions where edits repeatedly fail
- **Reflection memories** detect plateaus and shift proposer strategy
- This mirrors Karpathy's approach of giving the agent its recent history, but with typed, persistent memory that survives across runs

---

## 5. Relevant Tools and Papers (2025-2026)

We are building this ourselves (no framework dependency), but these inform the design:

### Tools (reference, not dependencies)

| Tool | Approach | Relevance |
|------|----------|-----------|
| **DSPy** (Stanford) | Compile-time prompt optimization via bootstrapped few-shot examples | Different goal (task accuracy, not security), but the "optimizer as compiler" framing is useful |
| **TextGrad** (Stanford, published in Nature) | Backprop-style textual gradients for iterative refinement | Instance-level, not prompt-level; interesting for future per-attack refinement |
| **PromptBreeder** (2023) | Evolutionary mutation/crossover of prompt populations | Population-based; overkill for single-prompt optimization but the mutation operators are relevant |
| **EvoPrompt** (Guo et al., 2025) | LLM-driven mutation for prompt evolution | Closest to our approach — single LLM proposes edits, evaluated against benchmark |
| **GEPA** (ICLR 2026 Oral) | Reflective prompt evolution with Pareto front | Most sophisticated; uses Pareto front for multi-objective. Our Pareto *floor* is simpler but sufficient |

### Papers

- **"Adaptive Attacks Break Defenses Against Indirect Prompt Injection"** (NAACL 2025 Findings) — 12 defenses broken by adaptive attacks. Key lesson: defense prompts must not be the *only* defense layer.
- **"SecAlign: Defending Against Prompt Injection with Preference Optimization"** (2025) — formulates injection defense as a preference that can be optimized. Relevant framing for our fitness function.
- **"PromptArmor: Simple yet Effective Prompt Injection Defenses"** (2025) — achieves <1% FPR and <1% FNR on AgentDojo with GPT-4o. Benchmark for what's achievable.
- **"Lessons from Defending Gemini Against Indirect Prompt Injections"** (Google DeepMind, 2025) — production-scale defense insights.
- **"Are My Optimized Prompts Compromised?"** (Arxiv 2510.14381) — vulnerabilities in LLM-based prompt optimizers, including fake reward attacks.
- **"Efficient Multi-Objective Prompt Optimization"** (OpenReview, 2025) — directly addresses weighted-sum vs Pareto approaches for prompt optimization.

### Key takeaway from the literature

Our approach — Karpathy-style propose/test/keep/revert with a weighted fitness function and Pareto floor — is well-grounded. The main gap vs. the literature is that we don't maintain a full Pareto front (population of prompts). This is intentional: we have one production prompt and want to monotonically improve it, not explore a prompt population. The Pareto floor constraint (no individual metric regression) compensates.

---

## Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Editable asset | `SYSTEM_PROMPT` in `amygdala/index.ts` | Single string, ~2100 tokens, git-tracked |
| Scalar metric | Weighted composite with Pareto floor | Security needs multi-metric; Pareto floor prevents gaming |
| Fitness weights | 0.5/0.3/0.1/0.1 | Detection-dominant; tunable; log weights in output |
| Edit granularity | Single surgical find/replace | Keeps diffs readable; prevents semantic drift |
| Stopping | 5 no-improvement OR 50 total | Matches Karpathy's diminishing returns observation |
| Optimization/holdout split | 12/6 | Balance attack types across both sets |
| Cost per iteration | ~$0.026 | Well within budget even at 50 iterations |
| Total worst-case cost | ~$1.31 | 50 iterations + validation |
| Framework | None (custom runner) | Simpler, no dependency risk, matches Karpathy's minimalism |

---

## Sources

- [Karpathy Autoresearch GitHub](https://github.com/karpathy/autoresearch)
- [The New Stack: Karpathy's 630-line Script](https://thenewstack.io/karpathy-autonomous-experiment-loop/)
- [Fortune: The Karpathy Loop](https://fortune.com/2026/03/17/andrej-karpathy-loop-autonomous-ai-agents-future/)
- [Kingy AI: Autoresearch Minimal Agent Loop](https://kingy.ai/ai/autoresearch-karpathys-minimal-agent-loop-for-autonomous-llm-experimentation/)
- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [GEPA (ICLR 2026 Oral)](https://arxiv.org/pdf/2507.19457)
- [Efficient Multi-Objective Prompt Optimization](https://openreview.net/pdf/ffae7779a7ab5d13af394f7311537e4bcb8b0905.pdf)
- [Adaptive Attacks Break Defenses (NAACL 2025)](https://aclanthology.org/2025.findings-naacl.395.pdf)
- [PromptArmor](https://arxiv.org/html/2507.15219v1)
- [SecAlign](https://arxiv.org/html/2410.05451v2)
- [Are My Optimized Prompts Compromised?](https://arxiv.org/html/2510.14381)
- [Google DeepMind: Defending Gemini](https://storage.googleapis.com/deepmind-media/Security%20and%20Privacy/Gemini_Security_Paper.pdf)
- [DSPy](https://github.com/stanfordnlp/dspy)
- [TextGrad](https://github.com/zou-group/textgrad)
