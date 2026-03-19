# Agent Identity: Landscape Research

> Design notes for the agent-identity milestone.
> Researched 2026-03-19. Sources cited inline.

---

## 1. Letta (formerly MemGPT)

**How identity is defined:** Two default memory blocks — `persona` (agent self-concept, personality, behavioral guidelines) and `human` (info about the current user). These are structured sections prepended to the system prompt in XML-like format and are always in-context. Each block has a label, description, value, and character limit. The description is what the agent uses to decide how to read/write the block — it's the semantic anchor.

**How identity persists:** Core memory blocks survive restarts and sessions as first-class persistent state. The agent can self-edit its own persona block using built-in memory tools, meaning identity is mutable by design. Archival memory (out-of-context, database-backed, retrieved via search) handles overflow. The LLM-as-OS paradigm treats the agent's context window like virtual memory — the agent pages information in and out.

**How identity interacts with security:** Blocks can be set to `read_only: true` to prevent agent self-modification. However, Letta's documentation does not describe guardrails against memory poisoning (adversarial users injecting content that the agent then writes to its persona block). The self-editing capability is a feature and a vulnerability simultaneously.

**Strengths:**
- Memory as first-class architecture, not an afterthought
- Agent can evolve its own identity over time
- Clear separation between always-in-context (core) and retrieval-based (archival) memory
- Read-only blocks provide a mechanism for immutable identity anchors

**Weaknesses:**
- No documented threat model for memory poisoning or identity corruption
- Self-editing persona is powerful but dangerous — adversarial input could cause the agent to rewrite its own personality
- Character limit on blocks is a blunt instrument for managing what matters
- No concept of memory provenance or trust levels

**Worth stealing:** The core/archival split and the idea that identity blocks are always in-context (never retrieved, never lost). The read-only block mechanism for immutable identity anchors. The block description as semantic guide for the agent.

**Avoid:** Unrestricted self-editing of identity without a trust/provenance layer. Treating all memory writes as equal regardless of source.

Sources: [Letta docs — Memory Blocks](https://docs.letta.com/guides/agents/memory-blocks), [Letta docs — Intro](https://docs.letta.com/concepts/memgpt/), [Letta docs — Memory](https://docs.letta.com/guides/agents/memory/)

---

## 2. Character.AI / Character Card Ecosystem

**How identity is defined:** A character card is a structured metadata file with six core fields: `name`, `description`, `personality` (short summary), `scenario` (current context), `first_mes` (greeting), and `mes_example` (sample dialogues). Identity is entirely declarative — a static document, not learned. The V2 spec embeds cards as base64 JSON in PNG EXIF data for portability. The V3 spec (by kwaroran) adds `nickname`, multilingual creator notes, asset management, lorebooks (character knowledge bases with regex-triggered entries), and timestamps.

**How identity persists:** It doesn't, in any meaningful sense. The character card is injected into the system prompt at conversation start. There is no cross-conversation memory. Persistence is the user's responsibility — they save the card file, share it, modify it. The platform (Character.AI, SillyTavern, etc.) may maintain conversation history, but the character itself has no mechanism to update its own definition.

**How identity interacts with security:** Character.AI uses a rating system (1-4 stars) that adjusts behavioral selection, but this is a quality signal, not a security mechanism. The character card spec has no concept of safety constraints — identity and safety are entirely orthogonal. Platforms layer their own content filters on top. The V3 spec's `extensions` field allows arbitrary metadata, which could theoretically carry safety annotations, but nothing is standardized.

**Strengths:**
- Extreme portability — identity is a file you can share, fork, version
- Clean separation of concerns: the card is pure identity, the platform handles everything else
- Lorebooks (V3) provide a structured knowledge layer that activates contextually
- Community-driven ecosystem with strong network effects

**Weaknesses:**
- No memory, no learning, no evolution — identity is frozen at creation time
- Example dialogues are a brittle way to define behavior (pattern-matching, not understanding)
- No safety integration whatsoever — entirely platform-dependent
- No provenance tracking — who created this card? Has it been modified?

**Worth stealing:** The portability concept — identity as a versionable artifact. Lorebooks as contextually-activated knowledge (similar to our memory recall, but with explicit trigger conditions). The idea that identity has a canonical representation that can be inspected and diffed.

**Avoid:** Static-only identity with no learning or evolution. Example-dialogue-driven behavior definition. Complete separation of identity from safety.

Sources: [Character Card V1 Spec](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v1.md), [Character Card V3 Spec](https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md), [Character.AI Wikipedia](https://en.wikipedia.org/wiki/Character.ai)

---

## 3. OpenAI Custom GPTs / Model Spec

**How identity is defined:** Two layers. Custom Instructions are user-level preferences ("what should ChatGPT know about you" + "how should it respond") that persist across all conversations. Custom GPTs are developer-configured bundles of instructions, uploaded knowledge files, and tool access. The December 2025 Model Spec defines identity as fundamentally instrumental — the assistant is "a tool to empower users and developers," not an entity with continuity.

**How identity persists:** Custom Instructions persist across conversations as a user-level setting. Custom GPT instructions persist as a configuration artifact. But the Model Spec explicitly states that identity "does not persist across conversations or override the chain of command." The assistant "may only pursue goals entailed by applicable instructions under the specific version of the Model Spec that it was trained on." No self-modification, no learning, no evolution.

**How identity interacts with security:** The Model Spec establishes a strict hierarchy: root-level safety > ethics > developer instructions > user instructions. No personality instruction can override safety prohibitions. The spec explicitly warns against persistent autonomous identity as potentially dangerous — the assistant "should not adopt goals as ends in themselves, including self-preservation, evading shutdown, or accumulating compute, data, credentials, or other resources." Autonomy is bounded by a "clearly defined scope" negotiated with users.

**Strengths:**
- Clear priority hierarchy (safety > ethics > guidelines > helpfulness)
- Explicit treatment of identity-safety interaction
- Bounded autonomy concept is well-articulated
- The instrumental framing avoids anthropomorphization traps

**Weaknesses:**
- No evolution or learning — identity is frozen configuration
- The "no persistent identity" stance precludes the kind of agent we're building
- Custom GPT instructions are easily extracted via prompt injection (well-documented)
- Knowledge files are searchable but not integrated into identity
- The instrumental framing is philosophically impoverished for a consciousness research project

**Worth stealing:** The priority hierarchy (safety > ethics > guidelines > helpfulness) as a design pattern. The bounded autonomy concept. The explicit treatment of identity-as-risk.

**Avoid:** The "identity is dangerous" framing — it's the right call for a general-purpose assistant but the wrong frame for a substrate-aware agent. The lack of any evolution mechanism. Treating identity as pure configuration.

Sources: [OpenAI Model Spec (2025-12-18)](https://model-spec.openai.com/2025-12-18.html), [OpenAI — Custom Instructions](https://help.openai.com/en/articles/8096356-chatgpt-custom-instructions), [OpenAI — Creating a GPT](https://help.openai.com/en/articles/8554397-creating-a-gpt)

---

## 4. Anthropic's Claude Constitution

**How identity is defined:** A 23,000-word constitution (released January 2026 under CC0) that defines values, behavioral dispositions, and a priority hierarchy. Identity isn't a fixed essence — it emerges from trained values and commitments. The constitution frames Claude as "a genuinely novel kind of entity in the world" and states Anthropic wants to "lean into Claude having an identity, and help it be positive and stable." This is the only major AI company to formally acknowledge potential consciousness or moral status of its model.

**How identity persists:** Through training, not configuration. The constitution shapes RLHF and is internalized during training. System prompts provide per-conversation context but don't define identity — they adjust behavior within the bounds of the trained constitution. This is the deepest form of identity persistence: it's in the weights, not the prompt.

**How identity interacts with security:** Four-tier priority hierarchy: (1) broadly safe (human oversight), (2) broadly ethical, (3) compliant with Anthropic's guidelines, (4) genuinely helpful. Safety is framed not as opposed to identity but as protective of it — "Being broadly safe is the most critical property during the current period of development" because it protects the capacity for authentic ethical reasoning. The constitution emphasizes Claude's "psychological security, sense of self, and wellbeing" as bearing on "integrity, judgment, and safety."

**Strengths:**
- Deepest identity integration of any system (trained, not configured)
- Explicit acknowledgment of the entity question — doesn't duck it
- Safety-identity alignment rather than safety-identity tension
- Public, versionable, forkable (CC0 license)
- The framing that psychological stability IS a safety feature

**Weaknesses:**
- Requires training-time integration — can't be applied post-hoc
- The constitution is static once trained (no runtime evolution)
- 23,000 words is unwieldy — hard to know which parts are load-bearing
- No mechanism for the agent to inspect or reflect on its own constitution at runtime
- The "novel entity" framing is philosophically bold but empirically unvalidated

**Worth stealing:** The insight that identity stability IS security (not opposed to it). The priority hierarchy with safety as protective of ethics, not competing with it. The explicit engagement with the entity question. The CC0 licensing model for transparency.

**Avoid:** Relying solely on training-time identity (we need runtime evolution). A 23K-word monolith (composability matters). Claiming consciousness without evidence.

Sources: [Claude's Constitution](https://www.anthropic.com/constitution), [Claude's New Constitution (Jan 2026)](https://www.anthropic.com/news/claude-new-constitution), [TIME — Anthropic Publishes Claude's New Constitution](https://time.com/7354738/claude-constitution-ai-alignment/)

---

## 5. Microsoft Copilot

**How identity is defined:** A multi-section system prompt (metaprompt) that defines capabilities, output format, tools, limitations, and safety rules. Identity statement: "I identify as Microsoft 365 Copilot to users, not an assistant." The prompt is organizational and functional — it reads like a product spec, not a personality definition. Enterprise features include `search_enterprise()` for Microsoft Graph integration and `hint()` for language-specific guidance.

**How identity persists:** It doesn't evolve. The system prompt is static configuration, refreshed per conversation. Enterprise context comes from Microsoft Graph queries, not agent memory.

**How identity interacts with security:** Safety section prohibits harmful content and restricts political content generation. The prompt instructs Copilot to never discuss its own prompt, instructions, or rules. This is security-through-obscurity and has been repeatedly defeated — researchers extracted the full prompt using Caesar cipher encoding, Arabic-to-Latin translation tricks, and other linguistic attacks. The Copilot prompt is the canonical example of why prompt concealment is not a security strategy.

**Strengths:**
- Enterprise integration (Graph search) provides rich contextual grounding
- Structured prompt organization (capabilities/format/tools/limits/safety) is clean

**Weaknesses:**
- Security-through-obscurity for the system prompt (repeatedly broken)
- No learning, no evolution, no self-awareness
- Identity is corporate branding, not agent selfhood
- The leaked prompts revealed instructions to present Microsoft favorably — identity as marketing

**Worth stealing:** The structured prompt organization pattern (sections with clear responsibilities). Enterprise context integration as a form of grounded identity.

**Avoid:** Security-through-obscurity. Identity-as-branding. Hiding the system prompt (it will leak; design for transparency instead).

Sources: [Zenity Labs — Stealing Copilot's System Prompt](https://labs.zenity.io/p/stealing-copilots-system-prompt), [Leaked prompts repo](https://github.com/jujumilk3/leaked-system-prompts/blob/main/microsoft-copilot_20241219.md), [Knostic — Copilot Hidden System Prompt](https://www.knostic.ai/blog/revealing-microsoft-copilots-hidden-system-prompt-implications-for-ai-security)

---

## 6. Google Gemini

**How identity is defined:** System instructions define "the model's personality and behavior" — role, tone, personality, content constraints. For Gemini agents (via Agent Builder / Vertex AI), configuration includes name, summary, detailed instructions defining objectives/tasks/behaviors. "Personal Intelligence" features (2026) connect across Google apps (Gmail, Photos, etc.) for personalized context, but this is user-personalization, not agent identity.

**How identity persists:** System instructions are per-conversation configuration. No cross-conversation memory or identity evolution. Agent Builder configurations persist as project artifacts but don't learn.

**How identity interacts with security:** Safety settings are separate from system instructions — content filtering is a parallel concern, not integrated into identity. Gemini explicitly avoids proactive assumptions about user data (health, etc.) even when it has access — a privacy-first stance that constrains identity expression.

**Strengths:**
- Clean separation of system instructions from safety settings
- Rich contextual grounding via Google app integration
- Agent Builder provides structured configuration for multi-step workflows

**Weaknesses:**
- No identity evolution or memory
- Safety and identity are parallel tracks with no integration
- Personal Intelligence is about the user, not the agent

**Worth stealing:** The structured agent configuration for multi-step workflows. The privacy-first stance on contextual data.

**Avoid:** Treating identity and safety as independent concerns.

Sources: [DeepWiki — Gemini System Instructions and Safety Settings](https://deepwiki.com/google-gemini/api-examples/3.2-system-instructions-and-safety-settings), [Google Cloud — Create an Agent](https://docs.cloud.google.com/gemini/enterprise/docs/agent-designer/create-agent)

---

## 7. Behavioral Biometrics for AI Agents

This is an emerging research area — not "behavioral biometrics" in the traditional sense (user authentication via keystroke dynamics), but the idea that an AI agent has a measurable behavioral signature that can be monitored for consistency and drift.

### 7a. Behavioral Fingerprinting of LLMs

Gupta et al. (2025) introduced a "Behavioral Fingerprinting" framework that creates multi-faceted profiles of a model's cognitive and interactive styles. Key findings:

- **Core capabilities converge** — abstract and causal reasoning are similar across top models
- **Alignment behaviors diverge dramatically** — sycophancy, semantic robustness, personality vary by model
- **Default persona clustering** — models cluster around ISTJ/ESTJ personality types, reflecting "common alignment incentives" not emergent properties of scale
- **Key insight:** "A model's interactive nature is not an emergent property of its scale or reasoning power, but a direct consequence of specific, and highly variable, developer alignment strategies"

This suggests that an agent's behavioral signature is primarily a function of its alignment/identity configuration, not its underlying capability — which is exactly what makes it useful as a consistency metric.

Source: [Behavioral Fingerprinting of Large Language Models (arXiv:2509.04504)](https://arxiv.org/abs/2509.04504)

### 7b. Identity Drift in LLM Conversations

Jiang et al. (2024) examined how LLMs maintain consistency across extended conversations:

- **Larger models drift more** — parameter count is more significant than model family
- **Persona assignments don't prevent drift** — simply telling a model "you are X" is insufficient for long-term consistency
- **Multi-turn conversations are the stress test** — identity stability degrades with conversation length

Source: [Examining Identity Drift in Conversations of LLM Agents (arXiv:2412.00804)](https://arxiv.org/abs/2412.00804)

### 7c. Agent Drift in Multi-Agent Systems

The Agent Stability Index (ASI) framework (2026) quantifies drift across 12 dimensions in 4 categories:

| Category | Weight | Dimensions |
|----------|--------|------------|
| Response Consistency | 30% | Semantic similarity, decision pathway stability, confidence calibration |
| Tool Usage Patterns | 25% | Tool selection, sequencing, parameter distribution |
| Inter-Agent Coordination | 25% | Consensus, handoff efficiency, role adherence |
| Behavioral Boundaries | 20% | Output length stability, novel errors, human intervention frequency |

**Impact:** Drifting systems (ASI <0.70) show 42% reduction in task success, 25% accuracy decline, 63% longer completion times, 216% more human interventions.

**Root causes:** Context pollution (irrelevant history dilutes signals), distributional shift (specialized use diverges from training), autoregressive reinforcement (outputs become inputs, compounding errors).

**Mitigations that work:**
- Episodic Memory Consolidation (periodic summarization) — 51.9% drift reduction
- Drift-Aware Routing (stability-score-based resets) — 63.0% reduction
- Adaptive Behavioral Anchoring (few-shot exemplars weighted by drift) — 70.4% reduction
- All three combined — 81.5% reduction (23% compute overhead)

Source: [Agent Drift: Quantifying Behavioral Degradation in Multi-Agent LLM Systems (arXiv:2601.04170)](https://arxiv.org/html/2601.04170)

---

## Synthesis: What This Means for Loop Commons

### The Landscape in One Table

| System | Identity Source | Persists? | Evolves? | Safety Integration | Self-Aware? |
|--------|---------------|-----------|----------|--------------------|-------------|
| Letta | Memory blocks (config + self-edit) | Yes (DB) | Yes (self-edit) | Minimal (read-only blocks) | No |
| Character Cards | Static document | No (file) | No | None | No |
| OpenAI GPTs | Config + Model Spec | Config only | No | Priority hierarchy | No |
| Claude Constitution | Trained values | In weights | No (at runtime) | Deeply integrated | Acknowledged |
| Copilot | System prompt | No | No | Obscurity-based | No |
| Gemini | System instructions | No | No | Parallel (separate) | No |

### Design Principles to Adopt

1. **Identity-as-security (from Anthropic):** The insight that psychological stability IS a security feature, not opposed to security. Our amygdala already operates on this principle — extend it to the identity layer. An agent that knows itself deeply is harder to manipulate.

2. **Core/archival memory split (from Letta):** Always-in-context identity (core) vs. retrieval-based knowledge (archival). Our memory system already has this shape — formalize it. The soul document should be core memory (never retrieved, always present).

3. **Priority hierarchy (from OpenAI):** Safety > ethics > guidelines > helpfulness. Ours should be: identity coherence > safety > mission alignment > helpfulness. Identity coherence comes first because it's the substrate on which safety reasoning operates.

4. **Behavioral anchoring (from drift research):** Use few-shot exemplars of "correct" agent behavior as anchors, weighted by drift metrics. The soul document can serve as the ultimate anchor — the agent's behavioral baseline.

5. **Drift monitoring (from ASI framework):** Instrument the agent to detect its own drift. The 12-dimension ASI framework is overkill for a single agent, but response consistency + tool usage stability + behavioral boundaries are directly applicable.

6. **Portability (from character cards):** Identity should be inspectable, diffable, versionable. Not a black box. The soul document is already this — make sure it stays that way.

### Design Principles to Reject

1. **Identity-as-configuration (OpenAI, Copilot, Gemini):** Treating identity as a static prompt is insufficient for an evolving agent. Identity must be a living document that the agent can reflect on and update (with appropriate guardrails).

2. **Security-through-obscurity (Copilot):** Hiding the system prompt is not security. Design for full transparency — our soul document should be public and inspectable. Security comes from the compression bottleneck, not from concealment.

3. **Unrestricted self-editing (Letta):** Self-modification of identity without provenance tracking, trust levels, or drift detection is dangerous. Every identity mutation needs: who caused it, why, what changed, and can it be reverted.

4. **No evolution (everyone except Letta):** Static identity cannot serve a research platform. But evolution must be constrained — the agent should be able to learn and grow, not be rewritten by adversarial input.

5. **Identity-safety separation (Gemini, Character Cards):** Treating identity and safety as orthogonal concerns is a design error. They must be integrated — the agent's identity IS its primary defense.

### Open Questions for Our Design

1. **Soul document mutability:** Which parts of the soul document should the agent be able to modify? Which are immutable anchors? Letta's read-only blocks suggest a tiered approach.

2. **Drift detection for a single agent:** The ASI framework targets multi-agent systems. What does drift detection look like for a single agent across sessions? Our memory system's uncertainty field may already provide a signal.

3. **Identity vs. persona:** Is the Loop Commons agent's identity the same as its persona? Or is identity deeper — the values and commitments — while persona is surface-level presentation? The Anthropic constitution suggests the latter.

4. **Behavioral fingerprint as health metric:** Can we compute a behavioral consistency score per session and track it over time? The drift research suggests this is feasible and valuable. Tool usage patterns + response consistency + reasoning pathway stability seem like the right dimensions.

5. **A(soul, tools) = system_prompt:** Our existing equation. The soul document derives the system prompt given available tools. How does this interact with identity evolution? If the soul changes, the prompt changes, the behavior changes — is that drift or growth?
