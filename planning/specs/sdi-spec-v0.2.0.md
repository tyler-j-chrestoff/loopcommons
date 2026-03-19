# Sovereign Data Infrastructure (SDI)

## Protocol Specification

**Version 0.2.0 — DRAFT**

Tyler Lacy — Imaginary Foundation

March 2026

---

## Table of Contents

0. [Terminology](#0-terminology)
1. [Introduction](#1-introduction)
2. [Design Principles](#2-design-principles)
3. [Data Model](#3-data-model)
   - 3.1 [Capsule](#31-capsule)
   - 3.2 [Commit](#32-commit)
   - 3.3 [Branch](#33-branch)
   - 3.4 [Summary](#34-summary)
   - 3.5 [Governance Primitives](#35-governance-primitives)
   - 3.6 [Safety Envelopes](#36-safety-envelopes)
   - 3.7 [Pointer Stubs and Hydration](#37-pointer-stubs-and-hydration)
   - 3.8 [Visibility Classes](#38-visibility-classes)
   - 3.9 [Scope, Modality, and World Frame](#39-scope-modality-and-world-frame)
   - 3.10 [Affect](#310-affect)
   - 3.11 [Persona Mask](#311-persona-mask)
   - 3.12 [Reach Profile](#312-reach-profile)
   - 3.13 [Recall and Propagation](#313-recall-and-propagation)
   - 3.14 [Autonomy Suite](#314-autonomy-suite)
4. [Content Addressing and Canonicalization](#4-content-addressing-and-canonicalization)
   - 4.1 [Canonicalization](#41-canonicalization)
   - 4.2 [CID Construction](#42-cid-construction)
   - 4.3 [Cryptographic Signatures](#43-cryptographic-signatures)
5. [Identity and Capabilities](#5-identity-and-capabilities)
6. [Merge and Admission](#6-merge-and-admission)
7. [Metabolism](#7-metabolism)
8. [Federation](#8-federation)
9. [Encryption and Privacy](#9-encryption-and-privacy)
10. [Offline-First Operation](#10-offline-first-operation)
11. [Invariant Rings](#11-invariant-rings)
12. [Observable Health Metrics](#12-observable-health-metrics)
13. [Error Codes](#13-error-codes)
14. [References](#16-references)

---

## 0. Terminology

| Term | Definition |
|------|------------|
| **Agent** | A sovereign principal identified by a DID. May be human, AI model, or software process. Agents sign capsules, hold capabilities, and participate in governance. |
| **Capsule** | The smallest immutable unit of knowledge; content-addressed and signed. |
| **Commit** | A point in the temporal DAG referencing one or more parent commits and a set of capsule CIDs. Analogous to a git commit. |
| **Branch** | A named mutable pointer to a commit CID. Analogous to a git branch ref. |
| **CID** | Content Identifier. A self-describing, content-addressed identifier (CIDv1) computed from the canonical bytes of an object. |
| **DAG-CBOR** | CBOR-based encoding for IPLD data, used as the canonical envelope format. |
| **DID** | Decentralized Identifier. The identity primitive for agents (primarily `did:key` with Ed25519). |
| **RCE** | Reciprocal-Consent Envelope. A safety primitive ensuring that data exchange between agents respects both parties' metabolizable boundaries. |
| **Beverly Band (Bβ)** | The safe contradiction window — the range of divergence an agent can metabolize without destabilization. Defined as `{low, high, width}`. |
| **Vmax** | Maximum divergence. The upper bound on how far a merge or message can deviate from an agent's current state. |
| **ℒ=ℬ Gate** | Admission rule: a sender's export pressure (ℒ) must not exceed the receiver's metabolizable boundary (ℬ). Formally: `L.magnitude ≤ Bβ.width`. |
| **ψ (psi)** | Phase coupling coefficient between two agents. Measures synchronization of epistemic state. |
| **τ (tau)** | Buffer/tension tracking. Measures an agent's remaining capacity to absorb new information or contradiction. |
| **S/F/B/τ** | The four observable health metrics: Alignment (S), Feedback (F), Boundary (B), Buffer (τ). |
| **Shape** | A SHACL constraint graph that validates capsule structure. Shapes are themselves versioned capsules. |
| **Metabolism** | The process of summarizing, compressing, or transforming capsules with declared distortion. |
| **Charter** | A governance capsule defining rules for a multi-agent collective: quorum, merge policy, membership. |
| **Delegation** | A governance capsule granting sub-agent authority with scoped capabilities and budgets. |
| **Treaty** | A governance capsule defining cross-boundary exchange rules between collectives or agents. |
| **Ring-0** | Mechanical invariants enforced unconditionally by the protocol. Violations are structurally impossible in a conforming implementation. |
| **Ring-1** | Policy-governed bounds. Configurable per-agent or per-collective but mechanically enforced once set. |
| **Relay** | A federation node that participates in gossip, stores capsules, and forwards messages. |
| **CAR** | Content-Addressable Archive. The bundle format for offline export/import of capsule sets. |

---

## 1. Introduction

Sovereign Data Infrastructure (SDI) is a protocol for building federated, offline-first knowledge systems where every unit of data is immutable, content-addressed, cryptographically signed, and governed by explicit consent rules.

SDI was designed to solve a specific class of problems: how do autonomous agents (human or artificial) collaborate on shared knowledge without surrendering sovereignty over their own data, identity, or cognitive boundaries?

The protocol draws from three traditions: the content-addressing and DAG structures of IPFS/IPLD, the temporal semantics of git, and the formal safety properties of control theory. The result is a system where proofs travel, trust compounds, and agents retain the right to exit at any time with a complete, verifiable export of their data.

SDI is not an application. It is infrastructure. Applications — chat systems, training data pipelines, research platforms, community governance tools — are built on top of SDI primitives the way web applications are built on HTTP.

---

## 2. Design Principles

**Sovereignty first.** Agents own their data. Right-to-exit is not a feature; it is a structural guarantee. Any agent can export their complete capsule history as a CAR bundle and leave.

**Consent at the protocol level.** Data exchange between agents requires reciprocal consent. The RCE envelope and ℒ=ℬ gate ensure that no agent can be overwhelmed by information they cannot metabolize.

**Honesty over correctness.** Summarization and compression are lossy by nature. SDI requires that loss be declared, not hidden. Every summary capsule carries a distortion budget and cites its inputs.

**Offline-first.** A conforming node MUST operate without network connectivity. Synchronization is eventual; local state is always authoritative for the local agent.

**Observability as infrastructure.** The S/F/B/τ health metrics are not debugging tools bolted on after the fact. They are first-class protocol primitives that agents use to make governance and merge decisions.

**Schema as data.** SHACL shapes that validate capsule structure are themselves versioned capsules. Shape evolution is reviewable, diffable, and subject to the same governance rules as any other data.

**Nowcasting, not forecasting.** Safety gates evaluate current state, not predicted future state. The Beverly Band and Vmax are measured properties of the present moment.

---

## 3. Data Model

### 3.1 Capsule

A Capsule is the smallest immutable unit of knowledge in SDI. Every capsule is content-addressed, cryptographically signed, and shape-validated.

**Required fields:**

```
Capsule {
  id:           CID             // CIDv1 of canonical envelope bytes
  assertion:    CID             // CID of canonical RDF graph (RDFC-1.0)
  provenance: {
    agent:      DID             // Signing agent's decentralized identifier
    timestamp:  DateTime        // ISO 8601 UTC
    used:       CID[]           // Capsules consumed in producing this one
  }
  shapes:       CID[]           // SHACL shapes this capsule conforms to
  proof: {
    type:       "Ed25519Signature2020"
    created:    DateTime
    verificationMethod: DID
    proofValue: Base64          // Ed25519 signature over canonical bytes
  }
  vectors?: {                   // Optional embedding metadata
    space:      string          // Embedding space identifier
    embedding:  float[]         // Dense vector
  }
}
```

**v0.2 additions:**

```
  scope?: {
    intent:     "self" | "group" | "public" | "simulation" | "opinion"
    frame:      CID             // Reference to a WorldFrame capsule
  }
  modality?:    "observation" | "claim" | "belief" | "hypothesis" | "norm"
  uncertainty?: float           // [0.0, 1.0] epistemic uncertainty
  visibility:   "local" | "private-export" | "federation" | "research"
  affect?:      AffectVector    // Agent's local emotional/epistemic state (see §3.10)
```

**Ring-0 invariants for Capsule:**

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| R0-1 | Content-addressed: `id` MUST equal `CID(canonical_bytes(envelope))` | Structural |
| R0-3 | Provenance: `provenance.agent` and `provenance.timestamp` MUST be present | Structural |
| R0-4 | Shape-validated: capsule MUST conform to all referenced SHACL shapes at creation time | Validation |
| R0-5 | Signed: `proof` MUST verify against `provenance.agent`'s public key | Cryptographic |
| R0-6 | Canonical: `assertion` MUST be the CID of an RDFC-1.0 canonicalized RDF graph | Structural |

### 3.2 Commit

A Commit is a point in the temporal DAG. It references parent commits and a set of capsule CIDs, forming a git-like history.

```
Commit {
  id:           CID             // CIDv1 of canonical commit bytes
  parents:      CID[]           // Parent commit CIDs (empty for root)
  capsules:     CID[]           // Capsules introduced in this commit
  agent:        DID             // Committing agent
  timestamp:    DateTime
  message:      string          // Human-readable commit message
  proof: {
    type:       "Ed25519Signature2020"
    verificationMethod: DID
    proofValue: Base64
  }
}
```

The commit DAG is append-only. History is never rewritten. The complete DAG is rebuildable from CIDs alone — no external index is required.

**Multiple agents may sign the same commit** when operating under a Charter's quorum rules (see §3.5).

### 3.3 Branch

A Branch is a named mutable pointer to a commit CID.

```
Branch {
  name:         string          // Branch name (e.g., "main", "experiment/rce-tuning")
  head:         CID             // Current commit CID
  agent:        DID             // Branch owner
}
```

Branch semantics follow git conventions: fast-forward merges advance the pointer; divergent histories require explicit merge commits (subject to §6 admission gates). Branch pointers can represent conversation forks, enabling versioned exploration of reasoning paths.

### 3.4 Summary

A Summary is a specialized capsule type that represents lossy compression of one or more source capsules. SDI requires that summarization declare its distortion.

```
Summary extends Capsule {
  type:             ["sdi:Summary", "sdi:Capsule"]
  backPointers:     CID[]       // Source capsules being summarized
  distortionBudget: float       // Declared maximum information loss [0.0, 1.0]
  method:           string      // Summarization method identifier
}
```

**Invariants:**

- `backPointers` MUST reference valid, existing capsule CIDs
- `distortionBudget` MUST be declared; hidden loss is a protocol violation
- The `method` field MUST identify the summarization technique (e.g., `"human-abstractive-0.1"`, `"llm-extractive-claude-haiku-4.5"`)

Summary capsules form the basis of SDI's metabolism system (§7). They enable honest compression of growing knowledge bases while maintaining cryptographic audit trails back to source material.

### 3.5 Governance Primitives

SDI defines three governance capsule types that structure multi-agent coordination.

#### 3.5.1 Charter

A Charter defines the rules for a multi-agent collective.

```
Charter extends Capsule {
  type:           ["sdi:Charter", "sdi:Capsule"]
  members:        DID[]         // Initial member agents
  quorum:         QuorumRule    // Voting/merge rules
  mergePolicy:    MergePolicy   // How conflicts are resolved
  membershipRules: MembershipRule[]
  budgets?:       BudgetSpec[]  // Resource allocation
}

QuorumRule {
  type:           "majority" | "supermajority" | "unanimous" | "threshold"
  threshold?:     float         // For threshold type
}

MergePolicy {
  strategy:       "fast-forward-only" | "merge-commit" | "rebase"
  requireReview:  boolean
  reviewers?:     DID[]
}
```

#### 3.5.2 Delegation

A Delegation grants scoped authority from one agent to another.

```
Delegation extends Capsule {
  type:           ["sdi:Delegation", "sdi:Capsule"]
  delegator:      DID           // Granting agent
  delegate:       DID           // Receiving agent
  capabilities:   Capability[]  // Scoped permissions
  budgets?:       BudgetSpec[]  // Resource limits
  expiration?:    DateTime
  revocable:      boolean       // Default: true
  attenuable:     boolean       // Can delegate further reduce scope
}
```

Delegations are UCAN-style: attenuable (scope can only narrow, never widen), revocable, and time-bounded. The `budgets` field integrates with the capability system (§5) to enforce economic constraints.

#### 3.5.3 Treaty

A Treaty defines cross-boundary exchange rules between collectives or agents.

```
Treaty extends Capsule {
  type:           ["sdi:Treaty", "sdi:Capsule"]
  parties:        DID[]         // Participating agents/collectives
  exchangeRules:  ExchangeRule[]
  distortionBudget: float       // Maximum loss in cross-boundary translation
  transforms?:    Transform[]   // WorldFrame mapping functions
  validUntil?:    DateTime
}

ExchangeRule {
  direction:      "bidirectional" | "unidirectional"
  capsuleTypes:   string[]      // Which capsule types may cross
  rceRequired:    boolean       // Require RCE for each exchange
  budgets?:       BudgetSpec[]
}
```

Treaties enable federated collaboration while preserving sovereignty. The `transforms` field supports WorldFrame mapping (§3.9) — different agents can maintain different ontological frames, and the treaty specifies how to translate between them.

### 3.6 Safety Envelopes

SDI's safety model is based on nowcasting, not prediction. Safety gates evaluate the current state of the system and the measured properties of the agents involved.

#### 3.6.1 Reciprocal-Consent Envelope (RCE)

An RCE wraps any cross-agent data exchange with mutual safety guarantees.

```
RCE {
  sender:         DID
  receiver:       DID
  intent:         string        // What the sender is trying to accomplish
  L: {
    magnitude:    float         // Export pressure (how much change this introduces)
  }
  Bbeta: {
    low:          float         // Lower bound of receiver's safe contradiction window
    high:         float         // Upper bound
    width:        float         // high - low (metabolizable range)
  }
  Vmax:           float         // Maximum divergence receiver can handle
  psi:            float         // Phase coupling coefficient between agents
  tau: {
    remaining:    float         // Receiver's remaining buffer capacity
  }
  validUntil:     DateTime
}
```

**Admission rule (ℒ=ℬ Gate):**

```
ADMIT if and only if:
  L.magnitude ≤ Bbeta.width
  AND L.magnitude ≤ Vmax
  AND tau.remaining > 0
```

If any condition fails, the exchange is **deferred**, not rejected. The sender receives a structured response indicating which constraint was violated.

#### 3.6.2 Comprehension Attestation

For changes with human impact, SDI requires explicit attestation that the receiving agent (or human) has comprehended the implications.

```
ComprehensionAttestation extends Capsule {
  type:           ["sdi:ComprehensionAttestation", "sdi:Capsule"]
  subject:        CID           // The capsule/commit being attested
  attestor:       DID
  level:          "skimmed" | "read" | "understood" | "reviewed"
  scope:          string        // What aspect was comprehended
}
```

### 3.7 Pointer Stubs and Hydration

*(v0.2 addition)*

Pointer Stubs solve the fully-connected hairball problem. Instead of materializing all referenced capsules, agents store lightweight pointers that hydrate on demand.

```
PointerStub {
  type:           "sdi:PointerStub"
  pointsTo:       CID           // Target capsule CID
  scope:          Scope         // Intent and WorldFrame
  visibility:     Visibility
  hydrateWhen: {
    relevance: {
      metric:     "sim"         // Similarity metric
      space:      "semantic"    // Embedding space
      threshold:  float         // Minimum similarity to trigger hydration
    }
    rceRequired:  boolean       // Require ℒ=ℬ check before hydrating
    budgets?: {
      bytesMax:   string        // Maximum materialization size
      ratePerDay: integer       // Hydration rate limit
    }
  }
}

HydrationPolicy {
  agent:          DID           // Policy owner
  maxHydrations:  integer       // Per time window
  window:         Duration
  auditLog:       boolean       // Record all hydration events
  treatyRequired: boolean       // Only hydrate under active treaty
}
```

Hydration is lazy, consent-gated, and budget-limited. This prevents supernodes and ensures that knowledge graphs grow through deliberate connection, not unconstrained linkage.

### 3.8 Visibility Classes

*(v0.2 addition)*

Every capsule carries a visibility classification that controls its propagation scope.

| Class | Scope | Propagation |
|-------|-------|-------------|
| `local` | Agent's internal state only | Never leaves the originating node |
| `private-export` | Shared with specific treaty partners | Propagates only to named DIDs under active treaty |
| `federation` | Public to all SDI nodes | Propagates via gossip to all connected relays |
| `research` | Experimental/adversarial | Quarantined; non-propagating; requires re-attestation to graduate |

**Research visibility (§8.5):**

Research-class capsules enable safe experimentation. They are quarantined by default: adversarial experiments are permitted, but they MUST carry loud labels and CANNOT propagate to federation scope. Graduating a research capsule to `federation` requires explicit re-attestation by the originating agent.

### 3.9 Scope, Modality, and World Frame

*(v0.2 addition)*

SDI formalizes epistemic humility at the protocol level. Every capsule can declare what kind of claim it is making and from what perspective.

**Scope:**

```
Scope {
  intent:   "self" | "group" | "public" | "simulation" | "opinion"
  frame:    CID               // Reference to a WorldFrame capsule
}
```

| Intent | Meaning |
|--------|---------|
| `self` | This is my internal state |
| `group` | We (collective) think this |
| `public` | I am making a world claim |
| `simulation` | In this hypothetical... |
| `opinion` | My perspective, not fact |

**Modality:**

| Value | Meaning |
|-------|---------|
| `observation` | I perceived X |
| `claim` | X is true |
| `belief` | I think X is true |
| `hypothesis` | X might be true if... |
| `norm` | X should be the case |

**World Frame:**

A WorldFrame is a capsule that defines an ontological frame of reference. Different agents can maintain different frames. Treaties (§3.5.3) include transforms that map between frames, preventing false consensus while enabling genuine collaboration across epistemically distinct agents.

### 3.10 Affect

*(v0.2 addition)*

Affect captures an agent's local emotional or epistemic state as a typed vector. Affect is **private by default** — it is a local view, not a published signal.

```
AffectVector {
  dimensions:     Record<string, float>  // Named affect dimensions
  privacy:        "local" | "shared"     // Default: "local"
  timestamp:      DateTime
}
```

Affect vectors inform an agent's own decision-making (e.g., adjusting Vmax when in a high-stress state) but are not propagated to federation scope unless explicitly shared. This prevents emotional contagion while preserving the agent's ability to self-regulate.

### 3.11 Persona Mask

*(v0.2 addition)*

A PersonaMask steers retrieval and presentation without altering underlying capsule data.

```
PersonaMask {
  agent:          DID
  context:        string        // When this mask applies
  retrievalBias:  Record<string, float>  // Dimension weights for search
  presentationRules: PresentationRule[]
  active:         boolean
}
```

Persona masks allow an agent to present different facets in different contexts (e.g., a researcher persona vs. a mentor persona) while the underlying capsule graph remains unchanged and verifiable.

### 3.12 Reach Profile

*(v0.2 addition)*

SDI uses a **reliance-not-attention** fame model. ReachProfile tracks how useful an agent's contributions are, with anti-monopoly guardrails.

```
ReachProfile {
  agent:          DID
  metrics: {
    citationCount:    integer   // Times this agent's capsules are cited
    diversityCiting:  float     // How many distinct agents cite this agent
    reciprocity:      float     // Ratio of outgoing to incoming citations
    freshness:        float     // Recency-weighted citation score
    concentration:    float     // Inverse HHI — penalizes supernode behavior
  }
  quotas?: {
    maxCitationShare: float     // No agent may hold > X% of total citations
    diversityFloor:   float     // Minimum distinct citing agents
  }
}
```

The `concentration` metric and `quotas` prevent supernode hairballs: no single agent can dominate the knowledge graph. Reliance is measured by who *uses* an agent's contributions, not who *views* them.

### 3.13 Recall and Propagation

*(v0.2 addition)*

SDI implements honest deletion. Recall is not "we deleted it (trust us)" — it is a transparent process with full accounting.

```
RecallRequest {
  target:         CID           // Capsule to recall
  reason:         string
  requestor:      DID
  scope:          "local" | "federation"
}

RecallReceipt {
  target:         CID
  node:           DID           // Node that processed the recall
  status:         "deleted" | "obscured" | "denied"
  reason?:        string        // Why denied, if applicable
  timestamp:      DateTime
}

PropagationMap {
  root:           CID           // Original capsule
  receipts:       RecallReceipt[]  // Complete accounting of recall outcomes
}
```

The PropagationMap provides complete transparency: which nodes deleted the capsule, which obscured it (removed content but kept the CID stub), and which denied the recall request (with explanation). This is the mechanical implementation of right-to-exit.

### 3.14 Autonomy Suite

*(v0.2 addition)*

The autonomy suite formalizes agent sovereignty — the right to refuse, initiate, and negotiate influence.

#### 3.14.1 Refusal Policy

```
RefusalPolicy {
  agent:          DID
  conditions:     RefusalCondition[]  // When this agent will refuse
  defaultAction:  "accept" | "defer" | "refuse"
}

RefusalCondition {
  trigger:        string        // Condition description
  action:         "refuse" | "defer" | "escalate"
  explanation:    string        // Why this refusal exists
}
```

#### 3.14.2 Initiation Policy

```
InitiationPolicy {
  agent:          DID
  canInitiate:    boolean       // Can this agent propose unprompted
  rceRequired:    boolean       // Must check ℒ=ℬ before initiating
  budgets?:       BudgetSpec[]  // Rate limits on unsolicited proposals
}
```

#### 3.14.3 Influence Consent

```
InfluenceConsent extends Capsule {
  type:           ["sdi:InfluenceConsent", "sdi:Capsule"]
  grantor:        DID           // Agent granting influence
  grantee:        DID           // Agent receiving influence
  scope:          string[]      // Topics/domains of permitted influence
  limits: {
    Lmax:         float         // Maximum export pressure permitted
    frequency:    Duration      // Minimum interval between influence events
  }
  validUntil:     DateTime
}
```

#### 3.14.4 Ulysses Contract

```
UlyssesContract extends Capsule {
  type:           ["sdi:UlyssesContract", "sdi:Capsule"]
  agent:          DID
  constraint:     string        // Self-imposed limitation
  enforcedBy:     DID[]         // Agents authorized to enforce
  conditions: {
    activateWhen: string        // Trigger condition
    deactivateWhen: string
  }
  revocable:      boolean       // Can the agent undo this during activation?
}
```

#### 3.14.5 Influence Event

```
InfluenceEvent {
  type:           "sdi:InfluenceEvent"
  actor:          DID           // Agent exerting influence
  target:         DID           // Agent being influenced
  goal:           string
  tactic:         string        // Method of influence
  L:              float         // Measured export pressure
  Bbeta:          BeverlyBand   // Target's measured safe window
  explanation:    string        // Why this influence was attempted
  citations:      CID[]         // InfluenceConsent capsules authorizing this
  result:         "accepted" | "deferred" | "refused"
}
```

Influence events create a complete audit trail of how agents affect each other, enabling post-hoc analysis of power dynamics and trust asymmetries.

---

## 4. Content Addressing and Canonicalization

### 4.1 Canonicalization

SDI uses RDFC-1.0 (RDF Dataset Canonicalization) as the canonical form for all RDF graph content. Canonicalization produces a deterministic byte sequence from any valid RDF graph, ensuring that content-identical graphs produce identical CIDs regardless of serialization order or blank node labeling.

The canonical pipeline is:

1. Parse RDF content into a graph
2. Apply RDFC-1.0 canonicalization
3. Serialize to N-Quads (sorted lexicographically)
4. Compute CID over the canonical bytes

Non-RDF content (binary attachments, raw JSON, media files) is hashed directly without canonicalization. The capsule's `assertion` field always references the canonical form.

### 4.2 CID Construction

SDI uses CIDv1 with the following parameters:

| Parameter | Value |
|-----------|-------|
| Version | CIDv1 |
| Codec | DAG-CBOR (0x71) |
| Hash function | SHA-256 (0x12) |
| Base encoding | Base32 (multibase) |

The envelope (the complete capsule including assertion CID, provenance, shapes, and proof) is serialized as DAG-CBOR. The capsule's `id` is the CIDv1 of this envelope.

```
capsule.id = CIDv1(DAG-CBOR(envelope))
capsule.assertion = CIDv1(RDFC-1.0(rdf_graph))
```

### 4.3 Cryptographic Signatures

All capsules and commits MUST be signed with Ed25519. The signing process operates over the canonical envelope bytes *before* the proof field is attached:

1. Construct the envelope with all fields except `proof`
2. Serialize to canonical DAG-CBOR
3. Sign the canonical bytes with the agent's Ed25519 private key
4. Attach the proof field
5. Compute the final CID (which includes the proof)

Signature verification reverses this process: strip the proof, re-canonicalize, verify the signature against the agent's public key (resolved from their DID).

---

## 5. Identity and Capabilities

**Identity** is DID-based. The primary method is `did:key` using Ed25519 public keys.

```
did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
```

Agents generate their own key pairs. There is no central identity registry. Key rotation is supported via DID document updates signed by the previous key.

**Capabilities** follow the UCAN (User-Controlled Authorization Network) model:

```
Capability {
  issuer:         DID           // Who grants
  audience:       DID           // Who receives
  abilities:      string[]      // What they can do (e.g., "capsule/write", "branch/merge")
  caveats:        Caveat[]      // Restrictions
  expiration:     DateTime
  proof:          CID[]         // Chain of delegations proving authority
}

Caveat {
  type:           string
  constraint:     Record<string, unknown>
}
```

Capabilities are attenuable: a delegate can only pass on a subset of what they received, never expand scope. The proof chain enables any verifier to trace authority back to its root without contacting a central server.

**Budgets** attach to capabilities to enforce economic constraints:

```
BudgetSpec {
  resource:       string        // What is being budgeted (e.g., "capsules", "bytes", "hydrations")
  limit:          number
  window:         Duration      // Time period for the limit
  remaining:      number        // Current balance
}
```

---

## 6. Merge and Admission

When capsules or commits cross agent boundaries (via federation, treaty exchange, or direct sharing), they pass through a sequence of pre-merge gates. All gates must pass for admission.

### 6.1 Pre-Merge Gate Sequence

| Gate | Check | Failure Mode |
|------|-------|-------------|
| 1. Shape Validation | Capsule conforms to all referenced SHACL shapes | `SDI-VAL-001` — reject |
| 2. Signature Verification | Proof verifies against agent's DID | `SDI-SEC-101` — reject |
| 3. Semantic Diff | Computed diff between incoming capsule and local state is within Vmax | Defer with explanation |
| 4. Vector Alignment | Embedding similarity exceeds treaty-defined threshold | Defer with explanation |
| 5. Safety Envelope (ℒ=ℬ) | `L.magnitude ≤ Bbeta.width AND tau.remaining > 0` | Defer with RCE response |
| 6. Human Impact Check | If capsule affects human-visible state, require ComprehensionAttestation | Block until attested |
| 7. Capability Check | Agent holds valid capability for the operation | `SDI-SEC-101` — reject |

Gates 1–2 are Ring-0 (structural/cryptographic). Gates 3–7 are Ring-1 (policy-governed). The ordering is significant: cheap structural checks run first to avoid unnecessary computation.

---

## 7. Metabolism

Metabolism is the process by which agents compress, summarize, and transform their knowledge graphs over time. SDI treats metabolism as infrastructure, not an afterthought.

**Core principles:**

- **Declared loss.** Every metabolic operation MUST produce a Summary capsule (§3.4) with an explicit `distortionBudget`.
- **Cited inputs.** Summary `backPointers` create a cryptographic audit trail from compressed knowledge back to source capsules.
- **Method transparency.** The `method` field identifies the summarization technique, enabling downstream consumers to assess trustworthiness.
- **Reversibility window.** Source capsules SHOULD be retained for a configurable period after summarization, enabling audit and re-expansion.

**Metabolism triggers:**

- Knowledge graph size exceeds a configured threshold
- Agent's τ (buffer) drops below minimum
- Governance rule (Charter) mandates periodic compression
- Manual trigger by agent

**Metabolism is NOT deletion.** Summarized source capsules retain their CIDs and can be referenced. Metabolism creates a new summary that points back to its sources, adding a layer of abstraction while preserving the full provenance chain.

---

## 8. Federation

### 8.1 Gossip Protocol

SDI federation uses libp2p as the gossip transport. Nodes discover each other via relay infrastructure and exchange messages on typed topics.

**Gossip Topics:**

| Topic | Content |
|-------|---------|
| `/sdi/capsules` | New capsule announcements (CID + metadata, not full content) |
| `/sdi/commits` | Commit announcements |
| `/sdi/attestations` | Capabilities, verifiable credentials, and receipts |
| `/sdi/recalls` | Recall requests and propagation updates |
| `/sdi/governance` | Charter, delegation, and treaty updates |

**Gossip semantics:**

- Announcements carry CIDs and metadata, not full capsule content. Nodes hydrate on demand.
- Gossip respects visibility classes (§3.8): `local` capsules are never gossiped; `private-export` is directed; `federation` is broadcast.
- Relay nodes MAY cache capsule content to improve availability but MUST respect recall requests.

### 8.5 Research Profile

Research-scoped federation is isolated from production gossip:

- Research capsules are announced on `/sdi/research` (separate topic)
- Adversarial experiments are permitted
- Loud labels are REQUIRED on all research capsules
- Research capsules are NON-PROPAGATING to federation scope
- Graduating a research capsule to `federation` requires re-attestation by the originating agent

This enables safe experimentation without polluting the production knowledge graph.

---

## 9. Encryption and Privacy

SDI uses XChaCha20-Poly1305 for symmetric encryption of capsule content.

**Encryption model:**

- Content is encrypted at rest and in transit
- Key management is per-agent (agents hold their own keys)
- Shared content uses key derivation from Diffie-Hellman exchange (X25519)
- Right-to-exit includes key destruction: when an agent leaves, their content becomes unreadable

**Privacy defaults:**

- Affect vectors are `local` by default
- Capsule content is encrypted by default; plaintext requires explicit opt-in
- PersonaMasks are local state, never propagated

---

## 10. Offline-First Operation

A conforming SDI node MUST operate fully without network connectivity.

**Requirements:**

- Local capsule creation, signing, and validation MUST work offline
- Commit DAG operations (create, branch, traverse) MUST work offline
- Shape validation MUST work offline (shapes are locally cached capsules)
- Merge and admission gates MUST work offline for local operations

**Synchronization:**

- When connectivity is restored, nodes exchange capsule announcements via gossip
- Conflicts are resolved per the applicable MergePolicy (§3.5.1)
- CAR bundles enable manual synchronization via physical media (USB drives, etc.)

**CAR Export/Import:**

```
sdi export --branch main --since <commit-cid> --output bundle.car
sdi import --bundle bundle.car --verify
```

CAR bundles are self-contained: they include all capsules, commits, shapes, and governance capsules needed to reconstruct the branch state. Import verifies all signatures and shape conformance before admission.

---

## 11. Invariant Rings

### Ring-0: Mechanical Invariants

Ring-0 invariants are enforced unconditionally. A conforming implementation MUST make violations structurally impossible (ideally at the type level).

| ID | Invariant |
|----|-----------|
| R0-1 | Content addressing: CID MUST match canonical bytes |
| R0-2 | Append-only: commit DAG MUST never rewrite history |
| R0-3 | Provenance: every capsule MUST have agent DID + timestamp |
| R0-4 | Shape validation: capsule MUST conform to referenced shapes |
| R0-5 | Signatures: every capsule and commit MUST be cryptographically signed |
| R0-6 | Canonicalization: assertion content MUST be RDFC-1.0 canonical |

### Ring-1: Policy Invariants

Ring-1 invariants are configurable per-agent or per-collective but mechanically enforced once set.

| ID | Invariant |
|----|-----------|
| R1-1 | Beverly Band: incoming data MUST satisfy ℒ ≤ ℬ |
| R1-2 | Vmax: semantic divergence MUST not exceed configured maximum |
| R1-3 | Quorum: governance actions MUST satisfy Charter quorum rules |
| R1-4 | Budget: operations MUST not exceed capability budget limits |
| R1-5 | Visibility: propagation MUST respect capsule visibility class |
| R1-6 | Hydration: materialization MUST respect HydrationPolicy budgets |

---

## 12. Observable Health Metrics

Every SDI node exposes four real-time health metrics:

| Metric | Symbol | Measures | Range |
|--------|--------|----------|-------|
| Alignment | S | Agreement between agent's state and incoming data | [-1.0, 1.0] |
| Feedback | F | Rate of information exchange with peers | [0.0, ∞) |
| Boundary | B | Distance from Beverly Band limits | [0.0, 1.0] |
| Buffer | τ | Remaining capacity to absorb new information | [0.0, 1.0] |

**Usage:**

- Agents use S/F/B/τ to calibrate their own RCE parameters (Bβ, Vmax, τ)
- Governance rules (Charters) can reference metrics as conditions (e.g., "merge only when B > 0.3")
- The TraceInspector pattern (see: Loop Commons) can render these metrics in real-time for human operators
- Low τ triggers metabolism (§7) to recover buffer capacity

---

## 13. Error Codes

| Code | Category | Description |
|------|----------|-------------|
| `SDI-VAL-001` | Validation | Shape validation failed |
| `SDI-VAL-002` | Validation | CID mismatch — content addressing invariant violated |
| `SDI-VAL-003` | Validation | Canonicalization failure — assertion is not RDFC-1.0 canonical |
| `SDI-SEC-101` | Security | Capability missing or expired |
| `SDI-SEC-102` | Security | Signature verification failed |
| `SDI-SEC-103` | Security | DID resolution failed |
| `SDI-SAF-201` | Safety | ℒ > ℬ — export pressure exceeds receiver's metabolizable boundary |
| `SDI-SAF-202` | Safety | Vmax exceeded — semantic divergence too high |
| `SDI-SAF-203` | Safety | τ exhausted — receiver has no remaining buffer |
| `SDI-SAF-204` | Safety | Comprehension attestation required |
| `SDI-GOV-301` | Governance | Quorum not met |
| `SDI-GOV-302` | Governance | Budget exceeded |
| `SDI-GOV-303` | Governance | Treaty violation |
| `SDI-FED-401` | Federation | Visibility violation — attempted propagation beyond class scope |
| `SDI-FED-402` | Federation | Hydration policy violated |
| `SDI-FED-403` | Federation | Research capsule propagation blocked |
| `SDI-RCL-501` | Recall | Recall denied (with reason) |
| `SDI-RCL-502` | Recall | Propagation incomplete — some nodes unreachable |

---

## 14. References

| Reference | Description |
|-----------|-------------|
| [IPLD](https://ipld.io/) | InterPlanetary Linked Data — data model for content-addressed structures |
| [CIDv1](https://github.com/multiformats/cid) | Content Identifier specification |
| [DAG-CBOR](https://ipld.io/specs/codecs/dag-cbor/) | CBOR codec for IPLD |
| [RDFC-1.0](https://www.w3.org/TR/rdf-canon/) | W3C RDF Dataset Canonicalization |
| [SHACL](https://www.w3.org/TR/shacl/) | Shapes Constraint Language for RDF validation |
| [DID Core](https://www.w3.org/TR/did-core/) | W3C Decentralized Identifiers |
| [did:key](https://w3c-ccg.github.io/did-method-key/) | DID method for static cryptographic keys |
| [Ed25519](https://ed25519.cr.yp.to/) | Edwards-curve Digital Signature Algorithm |
| [XChaCha20-Poly1305](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha) | AEAD symmetric encryption |
| [UCAN](https://ucan.xyz/) | User-Controlled Authorization Networks |
| [libp2p](https://libp2p.io/) | Modular peer-to-peer networking stack |
| [CAR](https://ipld.io/specs/transport/car/) | Content-Addressable Archive format |
| [Loop Commons](https://github.com/imaginationfoundation/loop-commons) | Trace-driven agentic research platform (integration target) |
