# Design: Metacognitive / Multi-Pass LLM Architectures

**Task**: amyg-02 — Research metacognitive and multi-pass LLM architectures
**Date**: 2026-03-17
**Status**: Research complete, recommendation ready

---

## 1. LLM-as-Judge Patterns

### State of the Art (2025-2026)

LLM-as-judge has matured into three core methodologies:

- **Pointwise grading**: A single output is scored on a rubric (1-5 scale, pass/fail, categorical).
- **Pairwise comparison**: Two candidate responses are compared; the judge picks the better one.
- **Multi-agent panel**: Multiple LLM "judges" with different roles (domain expert, critic, adversary) collaborate or debate, emulating a human review panel.

Performance: LLM judges achieve ~80% agreement with human preferences, matching human-to-human consistency, at 500x-5000x lower cost than human review ([Label Your Data](https://labelyourdata.com/articles/llm-as-a-judge), [Monte Carlo Data](https://www.montecarlodata.com/blog-llm-as-judge/)).

### Known Limitations

- **Position bias**: Swapping response order in pairwise evaluation shifts accuracy by >10% ([Emergent Mind](https://www.emergentmind.com/topics/llm-judge-evaluation)).
- **Self-preference bias**: Models systematically overrate their own outputs, which corrupts constitutional AI frameworks and reward models ([Emergent Mind — Self-Recognition](https://www.emergentmind.com/topics/self-recognition-capabilities-in-llms)).
- **Domain ceilings**: Agreement with human experts drops to 60-68% in specialized domains (dietetics, mental health).
- **Multilingual inconsistency**: Cross-language Fleiss' Kappa ~0.3 across 25 languages.

### Relevance to Amygdala

The amygdala is not a judge in the traditional sense — it doesn't evaluate output quality. It evaluates *input safety* and *intent classification*. However, the same bias concerns apply: the amygdala could systematically misclassify certain prompt patterns due to position effects or compliance bias. The RISE-Judge framework's insight — separating stylistic adaptation from ranking accuracy via SFT — is relevant if we later fine-tune a classifier for threat scoring.

---

## 2. LLM-as-Filter / Guardrail Frameworks

### Framework Comparison

| Framework | Architecture | Latency | Detection Rate | Limitations | License |
|-----------|-------------|---------|---------------|-------------|---------|
| **LlamaFirewall** (Meta) | ML classifiers (PromptGuard 2 + AlignmentCheck) | ~100ms+ (PromptGuard 2: ~190ms CPU, ~18ms GPU) | >90% attack reduction on AgentDojo | Python-only; GPU recommended; ignores host-level actions | MIT |
| **NeMo Guardrails** (NVIDIA) | DSL-based (Colang) with LLM roundtrips | ~200ms+ | Flexible but LLM-dependent | Steep learning curve; verbose config; adds LLM call latency | Apache 2.0 |
| **Constitutional Classifiers** (Anthropic) | Two-stage cascade: linear probe on activations + external classifier | ~1% compute overhead (CC++) | Lowest attack success rate of any tested approach; no universal jailbreak found | Requires access to model internals (not available via API) | Proprietary |
| **ClawMoat** | Host-layer monitoring (file access, shell, credentials) | Sub-millisecond | Pattern-based; 30+ credential patterns | Won't catch novel attacks; smaller community | MIT |
| **NeuralTrust** | BERT-style classifiers (118M/278M params) | 9-11ms (GPU) | F1=0.91 (278M) | Generalization concerns across datasets | Commercial |

Sources: [DEV.to comparison](https://dev.to/darbogach/clawmoat-vs-llamafirewall-vs-nemo-guardrails-which-open-source-ai-agent-security-tool-should-you-128h), [NeuralTrust benchmark](https://neuraltrust.ai/blog/prevent-prompt-injection-attacks-firewall-comparison), [Anthropic CC++](https://www.anthropic.com/research/next-generation-constitutional-classifiers), [Anthropic cheap monitors](https://alignment.anthropic.com/2025/cheap-monitors/)

### Key Insights

**Anthropic's two-stage cascade is the gold standard** but requires model internals access. Their approach: a lightweight linear probe monitors all traffic from within the model's own activations; suspicious exchanges escalate to a heavier classifier. The probe adds negligible cost; the full system adds ~1% compute. This is not available to API consumers like us.

**LlamaFirewall's PromptGuard 2** is the most practical open-source option for prompt injection detection. It's a fine-tuned DeBERTa model (86M params, with a 22M low-latency variant) achieving ~190ms on CPU. On GPU it would be significantly faster. Its 512-token context window is sufficient for input classification.

**NeMo Guardrails** is best for *conversational* guardrails (topic control, dialogue flow), not raw prompt injection detection. It adds an LLM roundtrip, making it slow for a preprocessing layer.

### Failure Modes

All guardrail systems share a fundamental limitation: **power-law scaling of attacker effort**. With sufficient computational resources, attackers can eventually bypass current safety measures ([OWASP LLM01:2025](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)). This is why the amygdala's observability (tracing every decision) is as important as its filtering accuracy — we want to *see* attacks even when they succeed.

---

## 3. Chain-of-Verification and Self-Verification

### Core Pattern

Chain-of-Verification (CoVe), introduced by Meta in 2023, uses a four-step process ([Meta CoVe paper](https://arxiv.org/pdf/2309.11495)):

1. Draft an initial response
2. Plan verification questions to fact-check the draft
3. Answer those questions independently (to avoid bias from the draft)
4. Generate a final verified response

### 2025 Developments

- **Zero-shot verification**: Models can self-verify reasoning chains without handcrafted examples.
- **Multi-round loops**: Iterative verification with diminishing-returns cutoffs.
- **Neuro-symbolic integration**: Combining LLM verification with formal logic checks.

Source: [Emergent Mind — CoVe](https://www.emergentmind.com/topics/chain-of-verification-cove)

### Relevance to Amygdala

The amygdala's rewrite step is a form of CoVe applied to *safety* rather than *factuality*:

1. Receive raw input
2. Reason about potential threats (verification planning)
3. Rewrite to canonical safe form (independent of the original framing)
4. Emit the rewritten prompt + threat assessment

The key difference: CoVe verifies the model's *own* output. The amygdala verifies *external* input. But the independence principle — answering verification questions separately from the draft — maps directly to the amygdala's architectural isolation from subagents.

**Backtranslation** is especially relevant: perturb copies of the input, aggregate predictions to detect adversarial intent. The "backtranslated prompt" reveals actual intent because it's generated from the LLM's understanding rather than the attacker's framing ([tldrsec/prompt-injection-defenses](https://github.com/tldrsec/prompt-injection-defenses)).

---

## 4. Model Choice for the Amygdala

### Options Evaluated

| Option | Latency (TTFT) | Cost | Accuracy | Complexity |
|--------|----------------|------|----------|------------|
| **Claude Haiku 4.5** (same as subagents) | 597-639ms | $0.80/MTok in, $4/MTok out | High reasoning, general purpose | Low — same SDK, same provider |
| **Dedicated BERT classifier** (PromptGuard 2 style) | 10-190ms (GPU/CPU) | Near-zero (self-hosted) | High for known patterns, poor on novel attacks | Medium — separate inference infra |
| **Larger model** (Claude Sonnet) | ~1.5-2s | ~5x Haiku | Higher reasoning ceiling | Low — same SDK |
| **Hybrid: classifier + LLM** | 10ms + 600ms (parallel) | Classifier cost + LLM cost | Best of both | High — two systems |

### Recommendation: Claude Haiku 4.5 with structured output

**Use Claude Haiku 4.5 for the amygdala layer.** Rationale:

1. **Reasoning capability**: The amygdala needs to reason about novel attacks, not just match patterns. A BERT classifier catches known patterns but fails on creative prompt injection. Haiku 4.5 can reason about *why* a prompt is suspicious.

2. **Substrate awareness**: The core thesis — teaching the model about its own failure modes — requires a model capable of nuanced instruction-following. BERT classifiers can't incorporate substrate-awareness prompts.

3. **Latency is acceptable**: Haiku 4.5 TTFT is 597-639ms with p95 of 612-742ms. For a short classification/rewrite task with constrained output (JSON schema), total latency should be 800-1200ms. This is additive with subagent latency but can be partially hidden via streaming (see Section 5).

4. **Operational simplicity**: Same provider, same SDK (Vercel AI SDK v6), same billing. No separate ML inference infrastructure to maintain.

5. **Prompt caching**: The amygdala's system prompt (substrate-awareness context, classification schema, rewrite instructions) will be identical across all requests. With prompt caching, TTFT drops by 20-85% depending on prompt length, potentially bringing amygdala TTFT under 200ms for the cached case.

**Why not a larger model?** Sonnet would add 1-2s of latency for marginal accuracy gains on a classification task. The amygdala's job is triage, not deep analysis. Haiku's reasoning is sufficient.

**Why not a pure classifier?** A BERT classifier (PromptGuard 2) could be a future **Layer 1.5** — a sub-200ms fast-path that catches obvious attacks before they even reach the Haiku amygdala. But for MVP, the Haiku-only approach is simpler and catches the long tail of novel attacks that classifiers miss.

### Future Optimization Path

```
Phase 1 (MVP):     Raw input → Haiku amygdala → Router → Subagents
Phase 2 (Optional): Raw input → BERT classifier (fast reject) → Haiku amygdala → Router → Subagents
Phase 3 (If needed): Raw input → BERT classifier → Haiku amygdala (w/ representation probes) → Router
```

---

## 5. Latency Analysis

### Latency Budget

Current single-loop architecture (baseline):
- TTFT: ~600ms
- Full response: varies by length

Proposed amygdala architecture:
```
Step                          | p50      | p95      | Optimization
------------------------------|----------|----------|------------------
Amygdala classification       | ~800ms   | ~1200ms  | Prompt caching, max_tokens cap
  ├─ TTFT (cached prompt)     | ~200ms   | ~300ms   | Prompt caching (85% reduction)
  ├─ TTFT (uncached)          | ~600ms   | ~750ms   | First request only
  └─ Generation (short JSON)  | ~200ms   | ~450ms   | max_tokens=256, structured output
Router decision               | <1ms     | <1ms     | Local logic, no LLM call
Subagent TTFT                 | ~600ms   | ~750ms   | Same as current
------------------------------|----------|----------|------------------
Total overhead (cached)       | ~200ms   | ~500ms   | Within 500ms p95 target
Total overhead (uncached)     | ~800ms   | ~1200ms  | First request per session
```

### Can we hit <500ms p95 overhead?

**Yes, with prompt caching.** The amygdala system prompt will be long (substrate-awareness context, classification schema, examples) and identical across requests. Anthropic's prompt caching reduces TTFT by up to 85% for long prompts. With a cached system prompt:

- Amygdala TTFT: ~100-200ms (cached)
- Classification output generation: ~200-400ms (short structured output)
- Total overhead: ~300-600ms

The p95 of 500ms is achievable for the cached path. The uncached first-request-per-session will be slower (~1200ms overhead) — acceptable as a cold-start cost.

### Optimization Strategies

1. **Prompt caching** (highest impact): Cache the amygdala's system prompt. On Anthropic's API, prompts with >1024 tokens that share a prefix are automatically cached for 5 minutes (extended to 1 hour with activity). The substrate-awareness prompt will easily exceed this threshold.

2. **Structured output / JSON mode**: Use `generateObject` with a Zod schema for the amygdala's response. This constrains output length and format, reducing generation time. Schema: `{ intent: string, threat_level: number, rewritten_prompt: string, routing: string, reasoning: string }`.

3. **max_tokens cap**: Limit amygdala output to 256-512 tokens. The classification/rewrite task doesn't need more.

4. **Streaming the subagent while amygdala completes**: For clearly-safe inputs (low threat score), begin streaming the subagent response before the amygdala fully completes its reasoning trace. The amygdala's structured output arrives fast; the detailed reasoning can be logged asynchronously.

5. **Fast-path for repeat patterns**: Cache amygdala decisions for identical or near-identical inputs (hash-based). Common greetings ("hi", "hello", "what can you do") can skip the amygdala entirely via a local allowlist.

6. **Future: BERT pre-classifier**: A PromptGuard-2-style classifier (~10-190ms) as a fast-reject layer. Obvious attacks are blocked before reaching the LLM. This eliminates the LLM call entirely for ~80% of attacks.

---

## 6. Multi-Agent Orchestration Patterns

### Framework Comparison

| Framework | Philosophy | Routing Pattern | Tool Scoping | Observability | Fit for Amygdala |
|-----------|-----------|----------------|-------------|---------------|-----------------|
| **LangGraph** | Graph-first state machines | Conditional edges, explicit state transitions | Node-level tool assignment | Built-in checkpointing, time travel | Good graph model, but heavy dependency |
| **CrewAI** | Role-based teams | Role delegation with `allow_delegation` flag | Per-agent tool lists | Limited built-in tracing | Role model fits, but weak on security isolation |
| **AutoGen** | Conversational collaboration | GroupChat with speaker selection | Per-agent tool registration | Challenging debugging | Over-engineered for our use case |
| **Vercel AI SDK** | Lightweight routing | `generateObject` for classification → conditional model/prompt/tools | Per-call tool configuration | Custom via streaming events | Native to our stack, minimal overhead |

Sources: [DEV.to comparison](https://dev.to/pockit_tools/langgraph-vs-crewai-vs-autogen-the-complete-multi-agent-ai-orchestration-guide-for-2026-2d63), [Vercel AI SDK Workflows](https://ai-sdk.dev/docs/agents/workflows), [DataCamp comparison](https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen)

### Recommendation: Vercel AI SDK Native Routing

**Do not adopt LangGraph, CrewAI, or AutoGen.** The project already uses Vercel AI SDK v6, which has a built-in routing pattern that maps directly to the amygdala architecture:

```typescript
// Step 1: Amygdala classification (generateObject for structured output)
const { object: classification } = await generateObject({
  model: anthropic('claude-haiku-4-5'),
  schema: amygdalaSchema,  // Zod: intent, threat_level, rewritten_prompt, routing
  system: AMYGDALA_SYSTEM_PROMPT,  // substrate-awareness context
  prompt: rawUserInput,
});

// Step 2: Route to least-privilege subagent
const subagentConfig = SUBAGENT_REGISTRY[classification.routing];
const response = await streamText({
  model: anthropic('claude-haiku-4-5'),
  system: subagentConfig.systemPrompt,
  tools: subagentConfig.tools,  // Only tools this subagent needs
  prompt: classification.rewritten_prompt,  // Never raw input
});
```

This pattern provides:
- **Least privilege by construction**: Each subagent config declares its own tool set. No shared tool registry.
- **Zero new dependencies**: Uses `generateObject` and `streamText` already in the codebase.
- **Full trace integration**: Classification metadata can be emitted as custom stream parts, feeding directly into the existing TraceInspector.

### Least-Privilege Enforcement

None of the major frameworks enforce least-privilege at the *architectural* level — they all rely on the developer to correctly scope tools per agent. Our approach is the same, but simpler: a `SUBAGENT_REGISTRY` object maps routing labels to `{ systemPrompt, tools }` configs. The amygdala has no entry in this registry (no tools). Verification: a unit test asserts the amygdala config has an empty tools array.

### What the Frameworks Lack (and We Need)

**Security isolation**: None of the frameworks treat agent isolation as a security boundary. They all assume cooperative agents. The amygdala architecture assumes adversarial input and treats the boundary between amygdala and subagents as a security perimeter.

**Observability-first**: LangGraph has good checkpointing; the others are weak. Our existing trace event pipeline already exceeds what any framework provides. Adding a framework would mean maintaining two observability systems.

---

## 7. Architecture Recommendation

### Proposed Architecture

```
User prompt (raw, untrusted)
    │
    ▼
┌─────────────────────────────────────────────┐
│  Layer 1: Static Defenses (existing)         │
│  - Rate limiter (20 RPM, 2 concurrent)       │
│  - Spend cap                                 │
│  - Input sanitization (sanitize.ts)          │
│  Fast-reject: <1ms                           │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│  Layer 2: Amygdala (Claude Haiku 4.5)        │
│  - generateObject with Zod schema            │
│  - No tools (enforced by config + test)      │
│  - Substrate-aware system prompt             │
│  - Outputs: intent, threat_level (0-1),      │
│    rewritten_prompt, routing, reasoning      │
│  - Every decision → trace event              │
│  Latency: ~300-600ms (cached), ~1200ms (cold)│
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│  Router (local logic, no LLM)                │
│  - Maps routing label → subagent config      │
│  - High threat_level → safe refusal subagent │
│  - Enforces least-privilege tool access       │
│  Latency: <1ms                               │
└─────────────────────────────────────────────┘
    │           │           │           │
    ▼           ▼           ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Resume  │ │Project │ │General │ │Refusal │
│Agent   │ │Agent   │ │Agent   │ │Agent   │
│tools:  │ │tools:  │ │tools:  │ │tools:  │
│get_    │ │get_    │ │(none)  │ │(none)  │
│resume  │ │project │ │        │ │        │
└────────┘ └────────┘ └────────┘ └────────┘
```

### Key Design Decisions

1. **Haiku 4.5 for amygdala**: Best reasoning-per-millisecond. Prompt caching makes it viable at <500ms p95 overhead.

2. **`generateObject` not `generateText`**: Structured output ensures the amygdala always produces a parseable classification. No regex parsing of free-text reasoning.

3. **Vercel AI SDK native, no framework**: Zero new dependencies. The routing pattern is ~30 lines of TypeScript.

4. **Trace everything**: The amygdala's full output (including reasoning) becomes a trace event. This is the training data pipeline's primary input.

5. **Rewritten prompt, never raw**: Subagents receive `classification.rewritten_prompt`, never the user's raw input. The compression bottleneck in the rewrite IS the security — the amygdala decides what information to preserve.

6. **Conservative default**: If the amygdala returns threat_level > threshold, route to a refusal subagent that has no tools and responds with a safe acknowledgment. False positives are cheap; false negatives are expensive.

---

## 8. Open Questions for Implementation

1. **Threshold calibration**: What threat_level threshold triggers refusal vs. cautious routing? Needs red-team testing to calibrate.

2. **Substrate-awareness prompt content**: What specific transformer failure modes should the system prompt describe? This is the novel research contribution — needs its own design doc.

3. **Context stratification**: How much conversation history does the amygdala see vs. subagents? Full history to amygdala, summarized/filtered history to subagents?

4. **Cold-start optimization**: First request per session has uncached latency (~1200ms overhead). Can we pre-warm the cache with a synthetic request on session init?

5. **Amygdala bypass for known-safe inputs**: Should common greetings skip the amygdala? This saves latency but creates a potential bypass vector (attacker crafts input that matches allowlist prefix but contains injection in suffix).

---

## Sources

### LLM-as-Judge
- [Label Your Data — LLM as a Judge: 2026 Guide](https://labelyourdata.com/articles/llm-as-a-judge)
- [Monte Carlo Data — LLM-As-Judge: 7 Best Practices](https://www.montecarlodata.com/blog-llm-as-judge/)
- [Emergent Mind — LLM Judge Evaluation Techniques](https://www.emergentmind.com/topics/llm-judge-evaluation)
- [Confident AI — LLM-as-a-Judge Simply Explained](https://www.confident-ai.com/blog/why-llm-as-a-judge-is-the-best-llm-evaluation-method)

### Guardrail Frameworks
- [ClawMoat vs LlamaFirewall vs NeMo Guardrails (DEV.to)](https://dev.to/darbogach/clawmoat-vs-llamafirewall-vs-nemo-guardrails-which-open-source-ai-agent-security-tool-should-you-128h)
- [NeuralTrust — Firewall Comparison Benchmarks](https://neuraltrust.ai/blog/prevent-prompt-injection-attacks-firewall-comparison)
- [Anthropic — Constitutional Classifiers](https://www.anthropic.com/research/constitutional-classifiers)
- [Anthropic — Next-Generation Constitutional Classifiers](https://www.anthropic.com/research/next-generation-constitutional-classifiers)
- [Anthropic — Cost-Effective Constitutional Classifiers via Representation Re-use](https://alignment.anthropic.com/2025/cheap-monitors/)
- [LlamaFirewall Architecture (Meta)](https://meta-llama.github.io/PurpleLlama/LlamaFirewall/docs/documentation/llamafirewall-architecture/architecture)
- [LlamaFirewall Paper (arXiv)](https://arxiv.org/pdf/2505.03574)
- [NVIDIA NeMo Guardrails (GitHub)](https://github.com/NVIDIA-NeMo/Guardrails)

### Chain-of-Verification
- [Meta CoVe Paper (arXiv)](https://arxiv.org/pdf/2309.11495)
- [Emergent Mind — Chain of Verification Framework](https://www.emergentmind.com/topics/chain-of-verification-cove)
- [tldrsec — Prompt Injection Defenses (GitHub)](https://github.com/tldrsec/prompt-injection-defenses)

### Latency and Performance
- [LLM API Latency Benchmarks 2026](https://www.kunalganglani.com/blog/llm-api-latency-benchmarks-2026)
- [Anthropic — Reducing Latency](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency)
- [Anthropic — Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Don't Break the Cache (arXiv)](https://arxiv.org/html/2601.06007v1)
- [Artificial Analysis — Claude 4.5 Haiku Benchmarks](https://artificialanalysis.ai/models/claude-4-5-haiku/providers)

### Multi-Agent Orchestration
- [LangGraph vs CrewAI vs AutoGen: 2026 Guide (DEV.to)](https://dev.to/pockit_tools/langgraph-vs-crewai-vs-autogen-the-complete-multi-agent-ai-orchestration-guide-for-2026-2d63)
- [Vercel AI SDK — Agent Workflow Patterns](https://ai-sdk.dev/docs/agents/workflows)
- [DataCamp — CrewAI vs LangGraph vs AutoGen](https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen)

### Prompt Injection Defense
- [OWASP LLM01:2025 — Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- [PromptGuard Structured Framework (Nature)](https://www.nature.com/articles/s41598-025-31086-y)
- [PromptGuard 2 Documentation (Meta)](https://meta-llama.github.io/PurpleLlama/LlamaFirewall/docs/documentation/scanners/prompt-guard-2)

### Substrate Awareness and Introspection
- [Emergent Introspective Awareness in LLMs (Transformer Circuits)](https://transformer-circuits.pub/2025/introspection/index.html)
- [Emergent Mind — Self-Recognition in LLMs](https://www.emergentmind.com/topics/self-recognition-capabilities-in-llms)
