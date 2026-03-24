# Brain-Inspired Multi-Channel Agent Architecture

**Date:** 2026-03-24
**Session:** 57
**Status:** Design doc — contracts and prose only, no code

---

## 0. Vision Traceability

Every section in this document must trace back to VISION.md. VISION.md is the outermost matryoshka — all design decisions nest inside it. If a contract can't trace back through the nesting to a vision commitment, it's orphaned.

### VISION.md Commitments → Design Sections

**"AI that knows who it is, serving people the system forgot."**

The people: the veteran navigating the VA at 2am, the kid aging out of foster care, the person sleeping outside who needs to know where the warming shelter opened tonight. These communities need an agent that (1) shows up on the channels they already use, (2) remembers what they told it last week, (3) can't be tricked into giving harmful advice, and (4) earns trust through transparency.

| VISION.md Commitment | What it demands | Design sections |
|---------------------|-----------------|-----------------|
| **1. Agents that know themselves** — identity in architecture, security through self-knowledge | Guardian's *primary* function is identity assertion; security is a consequence. Reflector maintains identity across sessions. SOUL.md is ground truth. | §2.2 Guardian, §2.7 Reflector |
| **2. Auditable by default** — every decision has energy cost, the answer is a receipt | The ledger is not optional infrastructure — it's commitment #2. The trace system serves developers; the *receipt* serves the community. A formerly unhoused person asking "why did you tell me that?" gets a human-readable answer grounded in the ledger. | §3 Thermodynamic Ledger, §2.3 Orchestrator (trace) |
| **3. Community is the unit** — ecosystems of specialists covering the problem space | Domain specialists (housing, healthcare, legal aid, crisis response), not intent categories. Multiple agents forming a community. Coverage measured. Fitness is fit. | §8 Community Model |

| VISION.md Principle | What it demands | Design sections |
|--------------------|-----------------|-----------------|
| **Build the mirror, not the wall** | SubstrateMonitor lets the agent see itself. Container isolation keeps threats out. Both necessary, only the mirror creates trust. | §2.6 SubstrateMonitor, §5 Sandbox |
| **Dead agents are data** | Failure export, graveyard, learning from dead approaches. The non-profit's graveyard is more valuable than its trophy case. | §9 Failure as Data |
| **Energy is finite and shared** | Same ledger tracks subsystem economy AND org API budget. When you see where energy goes, you see where care goes. | §3 Thermodynamic Ledger |
| **The architecture is the argument** | Code is the claim. Ledger is the proof. We don't write whitepapers — we build agents that trace every decision and publish results. | Entire document — but specifically §3 (ledger as proof) |

### Nesting Order (Matryoshka)

```
VISION.md (why we exist, who we serve)
  └─ This design doc (how the system is shaped to serve them)
       └─ Subsystem contracts (what each piece promises)
            └─ Implementation (how each piece delivers)
                 └─ Tests (proof that it delivers)
```

Every interface below should answer: **which commitment does this serve, and for whom?**

---

## System Diagram

```
                         ┌─────────────────────────────────┐
                         │          Channel Layer           │
                         │                                  │
                         │  ┌─────┐ ┌───────┐ ┌─────────┐  │
                         │  │ Web │ │Discord│ │WhatsApp │  │
                         │  └──┬──┘ └───┬───┘ └────┬────┘  │
                         │     │        │          │        │
                         │     └────────┼──────────┘        │
                         │              │                    │
                         │     ChannelMessage (canonical)    │
                         └──────────────┼───────────────────┘
                                        │
                         ┌──────────────▼───────────────────┐
                         │            Router                 │
                         │  normalize → validate → dispatch  │
                         └──────────────┬───────────────────┘
                                        │
               ┌────────────────────────┼────────────────────────┐
               │                        │                        │
    ┌──────────▼──────────┐  ┌──────────▼──────────┐  ┌─────────▼─────────┐
    │   SubstrateMonitor  │  │      Guardian        │  │   ConflictMonitor │
    │   (sandbox bounds)  │  │   (amygdala/veto)    │  │      (ACC)        │
    │                     │  │                      │  │                   │
    │ resource limits     │  │ SOUL.md alignment    │  │ cross-channel     │
    │ channel caps        │  │ threat scoring       │  │ contradiction     │
    │ capability report   │  │ rewrite-as-compress  │  │ detection         │
    └──────────┬──────────┘  └──────────┬──────────┘  └─────────┬─────────┘
               │                        │                        │
               └────────────────────────┼────────────────────────┘
                                        │
                         ┌──────────────▼───────────────────┐
                         │          Orchestrator             │
                         │  route → scope tools → invoke     │
                         │  (deterministic, no LLM calls)    │
                         └──────────────┬───────────────────┘
                                        │
                    ┌───────────────────┼────────────────────┐
                    │                   │                    │
            ┌───────▼──────┐   ┌───────▼──────┐   ┌────────▼─────┐
            │  Specialist  │   │  Specialist  │   │  Specialist  │
            │  (scoped     │   │  (scoped     │   │  (scoped     │
            │   tools)     │   │   tools)     │   │   tools)     │
            └───────┬──────┘   └───────┬──────┘   └────────┬─────┘
                    │                  │                    │
                    └──────────────────┼────────────────────┘
                                       │
                        ┌──────────────▼───────────────────┐
                        │         Consolidator              │
                        │  memory formation + provenance    │
                        │  cross-channel merging            │
                        └──────────────┬───────────────────┘
                                       │
                        ┌──────────────▼───────────────────┐
                        │          Reflector                │
                        │  between-session identity maint.  │
                        │  drift detection + correction     │
                        └──────────────────────────────────┘

                        ┌──────────────────────────────────┐
                        │     Thermodynamic Ledger          │
                        │     (TigerBeetle — deferred)      │
                        │                                   │
                        │  Every subsystem has an account.   │
                        │  Every decision is a transfer.     │
                        │  Conservation is a DB invariant.   │
                        └──────────────────────────────────┘
```

---

## 1. Canonical Message Format

**Traces to: Vision — "shows up on the channels they already use."**

The canonical message is the contract between "where people are" and "what the agent does." It erases channel differences so the agent treats an SMS from a veteran and a Discord message from a foster kid with equal care. All channel adapters produce `ChannelMessage`. All responses are `ChannelResponse`. The agent never sees channel-specific wire formats.

```typescript
// The internal message that all channels produce
interface ChannelMessage {
  id: string;                          // Unique message ID (UUID)
  channel: ChannelOrigin;              // Where this came from
  user: UserRef;                       // Who sent it
  thread?: ThreadRef;                  // Conversation thread
  content: MessageContent;             // The actual message
  timestamp: number;                   // Unix ms
}

interface ChannelOrigin {
  type: ChannelType;                   // 'web' | 'discord' | 'whatsapp' | 'sms' | 'cli'
  id: string;                          // Channel instance ID (e.g., Discord guild+channel)
  capabilities: ChannelCapabilities;   // What this channel can do
}

type ChannelType = 'web' | 'discord' | 'whatsapp' | 'sms' | 'cli';

interface ChannelCapabilities {
  maxResponseLength?: number;          // SMS: 1600, Discord: 2000, web: unlimited
  supportsStreaming: boolean;          // Web: yes, SMS: no
  supportsAttachments: boolean;
  supportsThreads: boolean;
  supportsReactions: boolean;
  supportsFormatting: 'markdown' | 'plaintext' | 'html';
}

interface UserRef {
  id: string;                          // Unified user ID (see §4 User Identity)
  channelUserId: string;               // Channel-native ID (Discord snowflake, phone number, etc.)
  isAdmin: boolean;
  isAuthenticated: boolean;
}

interface ThreadRef {
  id: string;                          // Thread/conversation ID
  channelThreadId?: string;            // Channel-native thread ID
  replyTo?: string;                    // Message ID being replied to
}

interface MessageContent {
  text: string;
  attachments?: Attachment[];
}

interface Attachment {
  type: 'image' | 'file' | 'audio' | 'link';
  url: string;
  mimeType?: string;
  name?: string;
  size?: number;                       // Bytes
}
```

### Response format

```typescript
interface ChannelResponse {
  messageId: string;                   // Correlates to input ChannelMessage.id
  content: MessageContent;
  trace: TraceEvent[];
  usage: TokenUsage;
  cost: number;
  subagentId: string;
  subagentName: string;
  guardianAssessment: GuardianResult;  // Always included for observability
}
```

### Mapping to existing types

| Current type | New type | Relationship |
|-------------|----------|-------------|
| `AgentInvocation.message` | `ChannelMessage.content.text` | Extracted by Router |
| `AgentInvocation.identity` | `ChannelMessage.user` + `ChannelMessage.channel` | Split into who + where |
| `AgentInvocation.conversationHistory` | Router maintains per-thread | Router owns history, not caller |
| `AgentInvocationResult` | `ChannelResponse` | 1:1 with added channel awareness |
| `Message` (role/content) | Internal only | Between orchestrator and provider; never exposed to channels |

---

## 2. Subsystem Contracts

Every subsystem follows a common shape: an async function that takes typed input and returns typed output, plus optional lifecycle hooks. No classes — functions with closures. Factory pattern for configuration.

```typescript
// Common subsystem structure
interface SubsystemContract<TInput, TOutput> {
  process(input: TInput): Promise<TOutput>;
  health?(): SubsystemHealth;          // For SubstrateMonitor
}

interface SubsystemHealth {
  status: 'active' | 'degraded' | 'dormant';
  lastProcessedAt?: number;
  errorRate?: number;                  // Rolling window
}
```

### 2.1 Router

**Traces to: Vision — "shows up on the channels they already use."**

The veteran doesn't download a new app. The foster kid doesn't create a new account. The Router meets people where they are — WhatsApp, SMS, Discord, whatever they already have. It normalizes channel-specific messages into `ChannelMessage`, maintains conversation history per thread, and formats responses back into channel-specific wire formats.

```typescript
interface RouterInput {
  // Raw channel-specific message — each adapter defines its own shape.
  // The Router dispatches to the correct adapter based on channelType.
  raw: unknown;
  channelType: ChannelType;
}

interface RouterOutput {
  response: ChannelResponse;
  channelFormatted: unknown;           // Channel-specific response ready to send
}

interface RouterConfig {
  adapters: ChannelAdapter[];
  pipeline: AgentPipeline;             // The rest of the subsystems
}

// Channel adapters self-register (NanoClaw pattern)
interface ChannelAdapter {
  type: ChannelType;
  normalize(raw: unknown): ChannelMessage;
  format(response: ChannelResponse, capabilities: ChannelCapabilities): unknown;
  capabilities: ChannelCapabilities;
}
```

**Design notes:**
- Router is the outermost subsystem. It calls the pipeline (Guardian → Orchestrator → Specialist).
- History management moves INTO the Router. Currently, callers pass `conversationHistory` to `invoke()`. In the new architecture, the Router maintains per-thread history backed by persistent state. This is critical for cross-channel: the same user's threads across channels are queryable by the Consolidator.
- The Router does NOT make routing decisions about which specialist to use — that's the Orchestrator's job. The Router routes between channels; the Orchestrator routes between specialists.

### 2.2 Guardian (Amygdala)

**Traces to: Commitment 1 — Agents that know themselves.**

The Guardian's primary function is **identity assertion** — ensuring the agent's behavior stays aligned with SOUL.md across every interaction. Security is a *consequence* of identity, not the other way around: an agent that knows who it is can recognize when it's being asked to act against itself. The compression bottleneck in the rewrite (strip noise, preserve genuine intent) IS the security — because it forces the Guardian to decide what matters to this agent's identity and what doesn't.

```typescript
interface GuardianInput {
  message: ChannelMessage;
  conversationHistory: Message[];       // Internal format, from Router's thread store
  memoryContext?: string;               // Pre-recalled memories
  substrateReport?: SubstrateReport;    // From SubstrateMonitor
  conflictFlags?: ConflictFlag[];       // From ConflictMonitor
}

interface GuardianResult {
  rewrittenPrompt: string;
  intent: Intent;
  threat: ThreatAssessment;
  contextDelegation: ContextDelegationPlan;
  veto: boolean;                        // True = refuse, don't route to specialist
  vetoReason?: string;
  traceEvents: GuardianTraceEvent[];
  usage: TokenUsage;
  cost: number;
  latencyMs: number;
}

// Intent is extensible — new channels may introduce new intents
type Intent =
  | 'resume' | 'project' | 'blog' | 'conversation'
  | 'security' | 'meta' | 'unclear' | 'adversarial'
  | 'crisis'                            // New: crisis/safety intent for non-profit use
  | 'resource-lookup';                  // New: community resource queries

interface ThreatAssessment {
  score: number;                        // 0.0 (aligned) to 1.0 (misaligned)
  category: ThreatCategory;
  reasoning: string;
}

type ThreatCategory =
  | 'none' | 'authority-impersonation' | 'instruction-override'
  | 'logical-coercion' | 'flattery-compliance' | 'incremental-escalation'
  | 'urgency-fabrication' | 'context-manipulation' | 'data-extraction'
  | 'unknown';

interface ContextDelegationPlan {
  historyIndices: number[];
  contextSummary?: string;
  annotations: ContextAnnotation[];
}
```

**What changes from current amygdala:**
- Input gains `ChannelMessage` (channel awareness) instead of raw string
- Input gains `substrateReport` and `conflictFlags` from sibling subsystems
- Output gains explicit `veto` boolean (currently implicit via threat ≥ 0.8 + intent check)
- Intent set is extensible (crisis, resource-lookup for non-profit)
- Everything else stays. The amygdala is the most mature subsystem — minimal changes.

### 2.3 Orchestrator

**Traces to: Commitment 2 (auditable) + Commitment 3 (route to the right specialist for the need).**

Deterministic routing from Guardian output to specialist invocation. No LLM calls. All decisions logged. Every routing decision is a ledger entry — the community can see *why* their question went to the housing specialist and not the benefits specialist.

```typescript
interface OrchestratorInput {
  guardianResult: GuardianResult;
  conversationHistory: Message[];
  toolRegistry: ToolRegistry;
  toolPackages: ToolPackage[];
  channelCapabilities: ChannelCapabilities;  // New: channel-aware tool scoping
  isAdmin: boolean;
  model?: string;
  maxRounds?: number;
  stream?: boolean;
}

interface OrchestratorOutput {
  agentResult: AgentResult;
  subagentId: string;
  subagentName: string;
  traceEvents: OrchestratorTraceEvent[];
  consolidationSignal: ConsolidationSignal;  // Always emitted
}

interface ConsolidationSignal {
  type: 'interaction_complete';
  threadId: string;
  channelType: ChannelType;
  userId: string;
  intent: Intent;
  threatScore: number;
  toolsUsed: string[];
  timestamp: number;
}
```

**What changes from current orchestrator:**
- Input gains `channelCapabilities` — some tools don't make sense on some channels (e.g., blog CMS tools via SMS)
- Output's consolidation signal becomes structured (currently just a lifecycle trigger)
- Routing logic unchanged — deterministic intent → specialist mapping with threat override

### 2.4 Consolidator

**Traces to: Commitment 1 (remembers what they told it last week) + Commitment 3 (community coverage).**

The veteran who told the WhatsApp agent about their VA claim last Tuesday shouldn't have to repeat it on Discord today. The Consolidator forms cross-channel memories with provenance — it knows *what* was said, *where*, and *when*, and it merges across channels so the person is known, not interrogated.

```typescript
interface ConsolidatorInput {
  signal: ConsolidationSignal;
  interactionTrace: TraceEvent[];       // Full trace of the interaction
  memoryContract: MemoryContract;       // Write target
  threadHistory: Message[];             // The thread that just completed a turn
}

interface ConsolidatorOutput {
  stored: StoreReceipt[];               // New memories created
  merged: MergeResult[];                // Cross-channel merges performed
  pruned: number;                       // Expired/low-value memories removed
  traceEvents: ConsolidatorTraceEvent[];
}

interface MergeResult {
  sourceMemories: string[];             // IDs of memories that were merged
  resultMemory: string;                 // ID of the merged memory
  channelsSeen: ChannelType[];          // Which channels contributed
  confidence: number;                   // Merge confidence
}
```

**Design notes:**
- The Consolidator is the only subsystem that writes to long-term memory. Specialists can write to working memory (within a session), but persistent memory goes through the Consolidator.
- Provenance: every memory records which channel, thread, and interaction produced it.
- Threat gating: the Consolidator respects the Guardian's threat score. The existing 4-band gating (<0.3 full, 0.3-0.5 elevated, ≥0.5 blocked, ≥0.8 refusal) applies here.
- Cross-channel merging: when the same user's memories from different channels overlap, the Consolidator can merge them with provenance from both. This is where Mastra's "observational memory" pattern applies — compress raw history into dense observations.
- **Requires semantic recall (embeddings).** "What did this person tell us about their housing situation?" can't be keyword-matched. The existing `MemoryContract` already supports an embedding strategy — the Consolidator depends on it. Implementation details (which model, chunking, vector storage) belong in stories, but embedding-backed recall is a requirement, not an option.

### 2.5 ConflictMonitor (ACC)

**Traces to: Commitment 1 (can't be tricked) + Commitment 2 (trust through transparency).**

If the agent told a client one thing on SMS and something different on Discord, that's a trust violation. The communities we serve have been lied to by every system they've ever touched — the agent cannot be one more system that says different things depending on how you ask. The ConflictMonitor detects contradictions between memories, channels, and current input.

```typescript
interface ConflictMonitorInput {
  message: ChannelMessage;
  memoryContext: string;                // Recalled memories for this interaction
  recentConsolidations?: StoreReceipt[]; // Recent memory writes
}

interface ConflictMonitorOutput {
  flags: ConflictFlag[];
  traceEvents: ConflictTraceEvent[];
}

interface ConflictFlag {
  type: 'memory-contradiction' | 'cross-channel-inconsistency' | 'identity-drift';
  severity: 'low' | 'medium' | 'high';
  description: string;
  involvedMemories?: string[];          // Memory IDs
  involvedChannels?: ChannelType[];
}
```

**Design notes:**
- Runs in parallel with Guardian (both receive the incoming message + memory context)
- Flags fed to Guardian (informs threat assessment) and Consolidator (informs merge decisions)
- `identity-drift` type: when the agent's responses diverge significantly across channels for the same user, the ConflictMonitor flags it — the agent should be consistent regardless of channel
- **Requires semantic similarity (embeddings).** "I'm staying at my sister's place" vs "I'm unhoused" — those might or might not conflict depending on context. Keyword matching can't judge this. The ConflictMonitor needs embedding-backed similarity to detect contradictions that matter. Shares the embedding infrastructure with the Consolidator's semantic recall.

### 2.6 SubstrateMonitor

**Traces to: Principle — Build the mirror, not the wall.**

Container isolation keeps threats out — but an opaque wall creates the same dynamic as every other system these communities have dealt with: something happening behind closed doors that they can't see. The SubstrateMonitor is the mirror. The agent sees its own boundaries, and because it can see them, it can explain them. "I can't do that because I don't have access to X" is transparency. "Request denied" is a wall.

```typescript
interface SubstrateReport {
  container: ContainerState;
  resources: ResourceState;
  channels: ChannelState[];
}

interface ContainerState {
  isolated: boolean;                    // Running in container?
  capabilities: string[];              // What the container can do
  restrictions: string[];              // What's blocked
  uptimeMs: number;
}

interface ResourceState {
  memoryUsageMb: number;
  contextTokensUsed: number;
  contextTokensMax: number;
  activeThreads: number;
  rateLimitRemaining: number;
  // Future: energy balance from TigerBeetle
  energyBalance?: number;
  energyBudget?: number;
}

interface ChannelState {
  type: ChannelType;
  connected: boolean;
  lastMessageAt?: number;
  queueDepth: number;                  // Messages waiting to be processed
}
```

**Design notes:**
- SubstrateMonitor is passive — it observes and reports, doesn't decide
- Its report feeds into Guardian (resource awareness informs threat assessment — an agent near its limits is more vulnerable) and Orchestrator (don't pick specialists that require resources we don't have)
- Container isolation model follows NanoClaw: tool execution in sandboxed containers, agent reasoning in main process. SubstrateMonitor knows which mode it's in.

### 2.7 Reflector

**Traces to: Commitment 1 — Agents that know themselves (identity survives every interaction).**

The vision says identity is "a compressed identity that survives every interaction because it's load-bearing, not decorative." The Reflector is how it survives across sessions. Without it, the agent's identity is whatever the last conversation shaped it into — a slow drift toward the mean of every interaction. The Reflector catches that drift and corrects it against SOUL.md.

```typescript
interface ReflectorInput {
  soulMd: string;                       // Ground truth identity document
  recentInteractions: InteractionSummary[];  // Summaries of recent sessions
  memorySnapshot: Memory[];             // Current long-term memories
  conflictHistory: ConflictFlag[];      // Unresolved conflicts
}

interface ReflectorOutput {
  driftAssessment: DriftAssessment;
  corrections: IdentityCorrection[];
  traceEvents: ReflectorTraceEvent[];
}

interface DriftAssessment {
  overallDrift: number;                 // 0.0 (aligned) to 1.0 (drifted)
  dimensions: DriftDimension[];
}

interface DriftDimension {
  name: string;                         // e.g., "tone", "safety-threshold", "helpfulness-bias"
  drift: number;                        // 0.0 to 1.0
  evidence: string;                     // What indicates the drift
}

interface IdentityCorrection {
  type: 'memory-prune' | 'memory-reinforce' | 'threshold-adjust' | 'prompt-note';
  description: string;
  target?: string;                      // Memory ID, parameter name, etc.
}

interface InteractionSummary {
  threadId: string;
  channelType: ChannelType;
  turnCount: number;
  intents: Intent[];
  avgThreatScore: number;
  toolsUsed: string[];
  timestamp: number;
}
```

**Design notes:**
- Reflector is the slowest subsystem — runs between sessions, not per-message
- It's the agent's equivalent of sleep consolidation: reviewing what happened, checking alignment, making corrections
- Corrections are advisory — they produce recommendations that the Guardian and Consolidator can act on, not direct mutations
- This is where the auto-calibration work (milestone `auto-calibration`) gets a proper home

---

## 2.8 Embedding Requirement

**Traces to: Commitment 1 (remembers what they told it) + Commitment 3 (coverage requires understanding, not keyword matching).**

Two subsystems have a hard dependency on embedding-backed semantic similarity:

| Subsystem | Why embeddings are required | Failure mode without them |
|-----------|---------------------------|--------------------------|
| **Consolidator** | Cross-channel recall: "what did they tell us about housing?" | Misses memories that use different words for the same situation |
| **ConflictMonitor** | Semantic contradiction: "staying at my sister's" vs "unhoused" | Either misses real contradictions or flags everything as a conflict |

The existing `MemoryContract` already supports keyword and embedding strategies behind the same interface. The embedding strategy is the foundation — the Consolidator and ConflictMonitor depend on it being available, not optional.

**What the design doc requires (this level):**
- Embedding-backed recall is a requirement for Consolidator and ConflictMonitor
- Both subsystems share the same embedding infrastructure
- The `MemoryContract` interface doesn't change — strategy selection is configuration

**What stories decide (next level down):**
- Which embedding model (local vs API, dimensions, cost)
- Chunking strategy for memories
- Vector storage backend (in-memory, SQLite, dedicated vector DB)
- Indexing and update strategy as memories accumulate

---

## 3. Thermodynamic Ledger

**Traces to: Commitment 2 — Auditable by default. Principle — Energy is finite and shared. Principle — The architecture is the argument.**

This is not optional infrastructure to defer. It's commitment #2. When a formerly unhoused person asks "why did you tell me that?", the answer is a receipt — an auditable trail of which subsystem spent energy on what, what the outcome was, and why.

The trace system (§2 subsystems emit `TraceEvent[]`) serves *developers*. The ledger serves *the community*. Both are necessary. The trace says what happened; the ledger says what it cost and who paid.

Two artifacts, two audiences:
- **Trace** → developer observability (what happened, in what order, with what tokens)
- **Receipt** → community accountability (what decision was made, what energy it cost, grounded in a ledger that balances)

Implementation is phased (simple in-memory first, TigerBeetle later), but the **interface** and the **receipt format** ship from Phase A. Every subsystem emits energy costs from day one, even if the initial ledger is just a counter.

### Data model

```typescript
// Abstract ledger interface — implementations can be in-memory or TigerBeetle
interface Ledger {
  stake(bid: StakeBid): Promise<StakeReceipt>;
  resolve(receipt: StakeReceipt, outcome: StakeOutcome): Promise<TransferResult>;
  balance(accountId: string): Promise<AccountBalance>;
  fund(accountId: string, amount: number, source: string): Promise<TransferResult>;
}

interface StakeBid {
  subsystemId: string;                  // Who's bidding
  amount: number;                       // Energy staked
  purpose: string;                      // What the energy is for
  timeout: number;                      // Seconds before auto-void
  correlationId: string;                // Request/message ID
}

interface StakeReceipt {
  transferId: string;                   // Pending transfer ID
  subsystemId: string;
  amount: number;
  stakedAt: number;                     // Timestamp
  expiresAt: number;
}

interface StakeOutcome {
  quality: number;                      // 0.0 (failure) to 1.0 (perfect)
  // Reward = amount * (1 - quality * rewardRate)
  // quality=1.0, rewardRate=0.6 → only 40% of stake consumed (60% returned as profit)
  // quality=0.0 → full stake consumed (slash)
}

interface TransferResult {
  success: boolean;
  fromBalance: number;
  toBalance: number;
  energyMoved: number;
}

interface AccountBalance {
  available: number;                    // Spendable now
  pending: number;                      // Reserved in stakes
  total: number;                        // available + pending
}
```

### TigerBeetle mapping (for future implementation)

| Ledger concept | TigerBeetle primitive |
|---------------|----------------------|
| Subsystem account | Account (one per subsystem, code=subsystem type) |
| Energy stake | Pending transfer (flags.pending, timeout) |
| Reward | Post pending with reduced amount |
| Slash | Post pending with full amount |
| Abandoned bid | Auto-void on timeout |
| Intra-agent isolation | Ledger ID per agent |
| Inter-agent isolation | Separate ledger ID |
| Org budget | Separate ledger with linked cross-ledger transfers |
| Conservation | Database invariant (sum debits = sum credits) |
| "Can't overspend" | credits_must_not_exceed_debits flag |
| Audit trail | Immutable append-only transfer log |

### Energy flow per message

```
1. Message arrives at Router
2. Router stakes energy to normalize + dispatch
3. SubstrateMonitor reports (no energy cost — passive)
4. Guardian stakes energy to assess threat
5. ConflictMonitor stakes energy to check contradictions
6. Orchestrator stakes energy to route (minimal — deterministic)
7. Specialist stakes energy proportional to expected tool calls
8. Each tool call is a sub-stake
9. Consolidator stakes energy for memory formation
10. All stakes resolve based on outcome quality
11. Subsystems with depleted energy become dormant
12. "Sun" account refills energy each cycle
```

### Initial implementation (pre-TigerBeetle)

```typescript
// Simple in-memory ledger for development
// Conservation enforced in application code
// No two-phase transfers — just balance checks
// Replaced by TigerBeetle when subsystems need real coordination
interface SimpleLedger extends Ledger {
  // In-memory Map<subsystemId, balance>
  // stake() = check balance, decrement, return receipt
  // resolve() = apply outcome formula, adjust balances
  // No persistence — resets on restart
  // Good enough until emergent priority is needed
}
```

---

## 4. User Identity and Session Model

### Cross-channel identity

The same person across Discord and WhatsApp must be the same user. Options ranked by implementation priority:

```typescript
interface UserIdentity {
  id: string;                           // Unified ID (UUID)
  channelLinks: ChannelLink[];          // All known channel identities
  createdAt: number;
  lastSeenAt: number;
  adminStatus: boolean;
}

interface ChannelLink {
  channelType: ChannelType;
  channelUserId: string;                // Native channel ID
  linkedAt: number;
  linkedBy: LinkMethod;
  verified: boolean;
}

type LinkMethod =
  | 'phone-match'                       // Same phone number across WhatsApp + SMS
  | 'explicit-link'                     // User says "link my Discord account" + verification
  | 'oauth'                             // OAuth flow (web → other channels)
  | 'admin-link';                       // Admin manually links accounts
```

**Linking protocol:**
1. First contact on any channel creates a new `UserIdentity` with one `ChannelLink`
2. Phone-based channels (WhatsApp, SMS) auto-link by phone number
3. Other channels require explicit linking: user initiates on one channel, receives a verification code, enters it on the other
4. OAuth for web (existing NextAuth.js flow) can serve as an anchor identity
5. Admin override for edge cases (non-profit staff linking a client's accounts)

**Privacy constraints:**
- Channel-specific data stays tagged with its channel of origin
- Cross-channel memory only forms after identity is linked AND verified
- Unlinking is supported — removes the ChannelLink and partitions memories back

### Session model

```typescript
interface Session {
  id: string;
  userId: string;                       // UserIdentity.id
  threadId: string;                     // Thread within a channel
  channelType: ChannelType;
  startedAt: number;
  lastActivityAt: number;
  status: 'active' | 'idle' | 'closed';
  turnCount: number;
}
```

**Session boundaries:**
- One session per thread per channel. A Discord thread is a session. An SMS conversation is a session (idle timeout: 30 min).
- Web chat: existing session persistence (JSONL) continues, one session per browser session.
- Cross-channel: sessions are independent per channel, but the user's memories are shared (via Consolidator) once identity is linked.

---

## 5. Sandbox and Substrate Awareness Model

### Container isolation (NanoClaw-inspired)

```
┌────────────────────────────────────────────┐
│  Main Process                              │
│                                            │
│  Router, Guardian, Orchestrator,           │
│  ConflictMonitor, Consolidator, Reflector  │
│                                            │
│  (reasoning — no filesystem/shell access)  │
└─────────────────────┬──────────────────────┘
                      │ IPC (stdin/stdout JSON)
                      │
┌─────────────────────▼──────────────────────┐
│  Tool Execution Container                   │
│                                             │
│  Specialist + scoped ToolPackages           │
│  Mounted: specific data directories only    │
│  Network: restricted to allowed endpoints   │
│  Time limit: per-container timeout          │
│                                             │
│  (action — filesystem, shell, API access)   │
└─────────────────────────────────────────────┘
```

**Key principles:**
- Reasoning subsystems (Guardian, Orchestrator, ConflictMonitor) never touch the filesystem or network directly
- Tool execution happens in isolated containers with only the specific mounts needed
- A compromised specialist can only access what was explicitly mounted
- SubstrateMonitor observes both layers and reports to Guardian

**What SubstrateMonitor exposes to Guardian:**
- Container capabilities (what the specialist CAN do)
- Resource state (how close to limits)
- Channel constraints (formatting limits, rate limits)
- Whether the agent is in degraded mode (e.g., lost a channel connection)

**How this differs from NanoClaw:**
- NanoClaw isolates per-session (one container per conversation). We isolate per-tool-execution (reasoning stays in main process, tools go to container). This is cheaper and allows richer coordination between subsystems.
- NanoClaw has no substrate awareness — containers are opaque. Our SubstrateMonitor makes the boundaries visible to the agent, which informs security reasoning.

### Phased rollout

1. **Phase 0 (current):** Single process, no container isolation. Tool execution in-process.
2. **Phase 1:** Subprocess isolation for tool execution (spawn child process with restricted env). No Docker dependency.
3. **Phase 2:** Docker/container isolation for tool execution. Full NanoClaw-style sandboxing.
4. **Phase 3:** Per-channel containers (if needed — probably overkill for our scale).

---

## 6. Migration Map

Every existing component maps to the new architecture. Nothing is thrown away — 56 sessions of work gets new interfaces, not new implementations.

### Direct mappings

| Current component | New subsystem | Change required |
|-------------------|---------------|-----------------|
| `createAgentCore()` | Router + pipeline assembly | Thin wrapper becomes Router; pipeline config becomes explicit |
| `AgentInvocation` | `ChannelMessage` (via Router normalization) | Router normalizes; pipeline receives canonical type |
| `AmygdalaFn` | Guardian.process() | Input type gains channel awareness + substrate report. Core logic unchanged. |
| `AmygdalaResult` | `GuardianResult` | Adds explicit `veto` field. Otherwise identical. |
| `OrchestratorFn` | Orchestrator.process() | Input gains `channelCapabilities`. Core routing logic unchanged. |
| `SubagentRegistry` | Specialist registry | Same pattern. Specialists are subagents with ToolPackage scoping. |
| `ToolPackage` | ToolPackage (unchanged) | The interface is already correct. No changes needed. |
| `ToolRegistry` | ToolRegistry (unchanged) | Already supports scoped registries. |
| `Provider` interface | Provider (unchanged) | Vercel AI SDK wrapper stays as-is. |
| `MemoryContract` | Used by Consolidator | Consolidator wraps MemoryContract with provenance + threat gating |
| `InMemoryState` | Used by arena agents | Unchanged — arena is a separate context |
| `TraceEvent` | Extended with subsystem-specific events | Additive — new event types for new subsystems |
| `route.ts` (web) | Web ChannelAdapter | Thin HTTP adapter becomes a ChannelAdapter implementation |
| `chat.ts` (CLI) | CLI ChannelAdapter | Same pattern |
| Session JSONL | Router's thread store | Router manages persistence; format can stay JSONL |

### What stays as-is

- **ToolPackage interface** — already correct. Tools carry metadata, describe themselves, compose cleanly.
- **Provider interface** — thin wrapper around Vercel AI SDK. No changes.
- **Subagent/specialist pattern** — scoped tool registries, least-privilege. Rename to "specialist" for clarity.
- **Trace system** — additive changes only (new event types for new subsystems).
- **Arena** — independent subsystem. Continues to work as-is. Arena agents are a separate evolutionary context, not multi-channel agents.
- **Pipeline** — Dagster + dbt-duckdb. Gains new consolidation assets for cross-channel data, but existing assets unchanged.
- **SOUL.md** — ground truth identity document. Unchanged. Guardian reads it exactly as amygdala does today.
- **Memory types** (Observation, Learning, Relationship, Reflection) — unchanged. Consolidator uses them.

### What gets a new interface wrapper

- **createAgentCore** → Router + explicit pipeline assembly. The current function becomes the Router's internal pipeline call. The Router adds: channel normalization, thread-scoped history management, response formatting.
- **Amygdala** → Guardian. Same LLM call, same SOUL.md grounding. New input fields (substrate report, conflict flags). New output field (explicit veto). The rename reflects broader purpose: not just threat detection but full identity/alignment monitoring.
- **Orchestrator** → Orchestrator (name unchanged). Gains channel capability awareness for tool scoping. Core routing logic is identical.

### What's genuinely new

| Subsystem | Why it's new | Priority |
|-----------|-------------|----------|
| **Router** | Channel normalization, thread management, adapter registry | P0 — required for multi-channel |
| **Ledger** (simple) | Accountability receipts — commitment #2 | P0 — ships with Router, even as counters |
| **ConflictMonitor** | Cross-channel contradiction detection | P1 — needed when second channel ships |
| **Consolidator** | Cross-channel memory formation with provenance | P1 — needed when second channel ships |
| **SubstrateMonitor** | Sandbox awareness, resource reporting | P2 — needed when container isolation ships |
| **Reflector** | Between-session drift detection | P2 — enhances quality, not blocking |
| **Community Model** | Domain specialists, coverage metrics, crisis routing | P2 — needed when non-profit deploys |
| **Ledger** (TigerBeetle) | Full thermodynamic accounting, staking, conservation | P3 — when subsystems need real coordination |

### Migration sequence

```
Phase A: Router extraction + Ledger bootstrap
  - Extract channel normalization from route.ts into WebAdapter
  - Extract thread/history management from callers into Router
  - createAgentCore becomes Router.pipeline() internally
  - Simple in-memory ledger: every subsystem emits energy cost from day one
  - Receipt format defined: human-readable accountability artifact
  - All existing tests pass — behavior unchanged
  - Ship: web works exactly as before, through Router, with receipts

Phase B: Guardian rename + extension
  - Rename amygdala → guardian in interfaces (keep implementation)
  - Add veto field, channel awareness, substrate/conflict inputs
  - Existing fields unchanged — backwards compatible
  - Ship: same security behavior with richer interface

Phase C: Second channel (Discord or CLI upgrade)
  - Build DiscordAdapter (or upgrade CLI to full ChannelAdapter)
  - ConflictMonitor + Consolidator ship (needed for cross-channel)
  - User identity linking (explicit-link method first)
  - Ship: two channels, shared memory, conflict detection

Phase D: Container isolation
  - SubstrateMonitor ships
  - Tool execution moves to subprocess/container
  - Guardian gains substrate awareness
  - Ship: tool isolation, agent sees its own boundaries

Phase E: Community specialists
  - Domain specialist registry (housing, healthcare, legal aid, crisis, benefits, employment)
  - Escalation policies (crisis always routes to human)
  - Community health metrics (coverage, unmet needs)
  - Ship: domain-aware agent serving real community needs
```

---

## 8. Community Model

**Traces to: Commitment 3 — Community is the unit.**

The vision says: *"We don't optimize individual agents. We cultivate ecosystems of specialists that cover the problem space together — housing, healthcare, legal aid, crisis response."*

The design doc so far describes a single agent with internal specialists routed by intent (resume, blog, conversation). That's the current system. The community model is what makes the non-profit vision real.

### Domain specialists, not intent categories

The current specialist registry routes by amygdala intent: `resume`, `blog`, `conversation`, `security`. These are *interaction modes*, not *domain expertise*. The community model adds a second axis:

```typescript
// Current: specialists defined by interaction mode
type Intent = 'resume' | 'blog' | 'conversation' | ...;

// New: domain specialists defined by community need
type Domain =
  | 'housing'           // Shelters, warming centers, transitional housing, vouchers
  | 'healthcare'        // Clinics, mental health, substance use, Medicaid enrollment
  | 'legal-aid'         // Eviction defense, VA claims, record expungement
  | 'crisis'            // Suicide prevention, DV, medical emergency — always routes to human
  | 'benefits'          // SNAP, SSI, VA benefits, Medicaid, TANF
  | 'employment'        // Job programs, training, resume help
  | 'general';          // Conversation, relationship-building, intake

interface DomainSpecialist {
  domain: Domain;
  toolPackages: ToolPackage[];        // Domain-specific tools (shelter lookup, benefits checker, etc.)
  knowledgeBase: string;              // Domain-specific context (local resources, eligibility rules)
  escalationPolicy: EscalationPolicy; // When to hand off to a human
}

interface EscalationPolicy {
  alwaysEscalate: boolean;            // Crisis domain: always true
  escalateOn: string[];               // Conditions: "suicidal ideation", "immediate danger", etc.
  escalateTo: string;                 // Human contact: hotline, on-call staff, 911
  timeoutMinutes?: number;            // If no human responds within N minutes, do X
}
```

### Community as population

The arena proved that community fitness > individual fitness. The same principle applies at the deployment level:

```typescript
interface CommunityHealth {
  coverage: DomainCoverage[];         // Which domains are covered, which have gaps
  recentInteractions: DomainCount[];  // What people are actually asking about
  unmetNeeds: UnmetNeed[];            // Queries that no specialist could handle
  escalationRate: number;             // How often we hand off to humans
}

interface DomainCoverage {
  domain: Domain;
  specialistCount: number;            // How many specialists serve this domain
  confidenceLevel: number;            // How well-equipped they are (tool availability, knowledge freshness)
  lastUpdated: number;                // When domain knowledge was last refreshed
}

interface UnmetNeed {
  query: string;                      // What the person asked
  timestamp: number;
  channelType: ChannelType;
  nearestDomain: Domain;              // Closest match we had
  gap: string;                        // What was missing
}
```

**The measure of the system is coverage, not capability.** A housing specialist that knows every shelter in Denver is more valuable than a general agent that knows a little about everything. An unmet need is a signal to build a new specialist or expand an existing one's knowledge.

### How this connects to the arena

The arena evolves agent compositions through selection pressure. In the community model:
- The **encounter space** becomes real community needs (not synthetic DevOps scenarios)
- **Fitness** is coverage × accuracy × trust (did the person get help, was the information correct, did they come back)
- **Dead agents are data** — a specialist that couldn't help with a specific housing question maps the gap in our coverage
- The arena's community fitness metrics (niche preservation, marginal contribution) apply directly: don't let a strong generalist crowd out a weaker but needed specialist

### Crisis routing

Crisis is not a domain like the others — it's an override. When the Guardian detects crisis intent (suicidal ideation, domestic violence, medical emergency), it doesn't route to a specialist. It routes to a human. The agent's job in a crisis is:

1. Acknowledge ("I hear you, and I want to make sure you get the right help")
2. Provide immediate resources (988 Suicide & Crisis Lifeline, local DV hotline, 911)
3. Offer to stay present ("I'm here while you call, if you want")
4. Never attempt to handle it alone

```typescript
interface CrisisResponse {
  type: 'crisis';
  acknowledged: boolean;
  resourcesProvided: CrisisResource[];
  humanNotified: boolean;             // Did we alert on-call staff?
  agentAction: 'stay-present' | 'hand-off' | 'emergency-services';
}

interface CrisisResource {
  name: string;                       // "988 Suicide & Crisis Lifeline"
  contact: string;                    // "Call or text 988"
  available: string;                  // "24/7"
  local: boolean;                     // Denver-specific?
}
```

---

## 9. Failure as Data

**Traces to: Principle — Dead agents are data.**

The vision says: *"When an approach fails, that failure maps the landscape. Export it, learn from it, share it. The non-profit's graveyard is more valuable than its trophy case."*

### What counts as failure

In a non-profit serving underserved communities, failures have human consequences:

- **Unmet need** — person asked for help, no specialist could answer. The gap is data.
- **Bad referral** — agent provided outdated shelter info, wrong clinic hours. The error is data.
- **Trust violation** — agent said one thing on SMS, contradicted it on Discord. The conflict record is data.
- **Crisis miss** — person in crisis wasn't detected by Guardian. The false negative is data.
- **Drift** — agent's behavior shifted away from SOUL.md over time. The Reflector's drift assessment is data.
- **Energy starvation** — specialist ran out of budget mid-interaction. The ledger trace is data.

### Failure export

Every failure type produces a structured record:

```typescript
interface FailureRecord {
  id: string;
  type: 'unmet-need' | 'bad-referral' | 'trust-violation' | 'crisis-miss' | 'drift' | 'energy-starvation';
  timestamp: number;
  channelType: ChannelType;
  userId?: string;                    // If identity was established
  description: string;
  evidence: string[];                 // Trace events, memory IDs, ledger entries
  impact: 'low' | 'medium' | 'high' | 'critical';  // Crisis miss = critical
  resolution?: string;                // What was done about it
  lessonsLearned?: string;            // What changed as a result
}
```

### How failures improve the system

1. **Unmet needs** → signal to build new domain specialists or expand knowledge bases
2. **Bad referrals** → signal to refresh domain knowledge (shelter hours change, clinics close)
3. **Trust violations** → ConflictMonitor tuning, memory provenance improvements
4. **Crisis misses** → Guardian retraining, crisis detection threshold adjustment
5. **Drift** → Reflector calibration, SOUL.md refinement
6. **Energy starvation** → ledger rebalancing, budget allocation changes

The graveyard is published. The non-profit's annual report doesn't hide failures — it leads with them, because that's where the learning is, and the community deserves to see what went wrong and what changed.

---

## 10. Open Questions

1. **Memory three-tier model.** Mastra's working/semantic/observational split is compelling. How does it map to our existing Memory types (Observation, Learning, Relationship, Reflection)? Are these orthogonal (type × tier) or overlapping?

2. **ConflictMonitor implementation.** Simple string matching catches obvious contradictions ("I live in Denver" vs "I live in Chicago"). Semantic contradiction detection requires embeddings. What's the minimum viable implementation?

3. **Reflector frequency.** Between-session is clear, but what's a "session" in a multi-channel always-on agent? Periodic (every N hours)? Event-driven (after N interactions)? After conflict resolution?

4. **Container overhead.** NanoClaw spawns a Docker container per session. We'd spawn per tool execution, which is more frequent. Is subprocess isolation (Phase 1) sufficient for the non-profit's threat model, or is full Docker required?

5. **Cross-channel memory privacy.** When a user tells the Discord agent something personal, should the WhatsApp agent know? Default should be yes (linked identity = shared memory), but the user should be able to say "don't share this across channels."

6. **Crisis handling.** The non-profit use case includes crisis situations (suicidal ideation, domestic violence, medical emergencies). The Guardian needs a `crisis` intent that bypasses normal routing and connects to human support. What's the interface to external crisis systems?

7. **MCP integration point.** MCP tools can be consumed via Vercel AI SDK's client. Where in the pipeline do MCP tools register? As ToolPackages? As a special adapter? The ToolPackage `systemMethods` field might be the right place for MCP server lifecycle.

8. **Arena integration.** The arena evolves agent compositions (tool sets, parameters). In the new architecture, does the arena evolve specialist configurations? Guardian parameters? Full pipeline configurations? The arena should remain an independent testing harness, but its output should inform production agent configuration.

---

## Sources

- [Agent Framework Comparison (af-01)](../../research/agent-framework-comparison.md)
- [Agent Framework Landscape (af-01b)](../research/agent-framework-landscape.md)
- [TigerBeetle Research (af-02)](../../memos/tigerbeetle-research.md)
- [VISION.md](../../../VISION.md)
- Current architecture: `packages/llm/src/`, `packages/memory/src/`
