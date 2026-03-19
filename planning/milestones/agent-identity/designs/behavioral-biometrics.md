# Design: Behavioral Biometrics for Agent Identity Verification

> Research notes mapping fraud-detection behavioral biometrics to conversational agent identity recognition.

## 1. Behavioral Biometrics in Fraud Detection — State of the Art

Fraud detection platforms (BioCatch, Sardine, Feedzai) use **continuous behavioral authentication** — verifying identity not at login but throughout a session by matching real-time behavior against learned profiles. BioCatch alone collects 3,000+ signals per session ([BioCatch](https://www.biocatch.com/what-we-do)). The industry is projected at >20% CAGR through 2030 ([Facia](https://facia.ai/blog/how-biometrics-are-transforming-fraud-detection-in-2026/)).

### 1.1 Signal Categories

| Category | Signals | What it detects |
|---|---|---|
| **Keystroke dynamics** | Dwell time (key hold), flight time (inter-key gap), error rate, shift-hand preference | Typing rhythm is unique per person; bots have unnaturally consistent timing |
| **Mouse/pointer** | Trajectory curvature, velocity profile, click timing, jitter, scroll rhythm | Humans have smooth acceleration curves; bots move linearly or teleport |
| **Touch/mobile** | Swipe speed, pressure, pinch gestures, accelerometer/gyroscope tilt | Device orientation during typing is person-specific |
| **Navigation flow** | Page visit order, time-per-page, form-fill sequence, hesitation patterns | Legitimate users follow habitual paths; fraudsters hunt for targets |
| **Device fingerprint** | Hardware ID, screen resolution, installed fonts, timezone, browser plugins, WebGL renderer | Links sessions across time without cookies; detects emulators/VMs |
| **Copy-paste behavior** | Whether name/SSN/email is typed vs pasted, clipboard timing | Sardine found legitimate users never copy-paste their own name ([Sardine](https://www.sardine.ai/blog/how-can-behavioral-biometrics-prevent-fraud)) |
| **Cognitive signals** | Hesitation before sensitive fields, segmented typing, distraction events | Scam victims show coached behavior (unusual pauses at prompted moments) |
| **Session context** | Time of day, session duration, geographic consistency, device consistency | Account takeover shows up as sudden device/location/time shifts |

### 1.2 Key Architectural Patterns

1. **Profile-then-compare**: Build a behavioral profile over N sessions, then score new sessions against it. Anomaly = deviation from personal baseline, not from population mean.
2. **Continuous, not point-in-time**: Authentication at login is one check. Behavioral biometrics score every interaction within the session. BioCatch calls this "login to logout" coverage.
3. **Layered signals**: No single signal is reliable. Systems combine device fingerprint (stable, hard to spoof) + behavioral signals (dynamic, hard to replay) + contextual signals (time, location). A leading bank reported 35% fraud reduction using this layered approach ([PCBB](https://www.pcbb.com/bid/2025-04-02-is-behavioral-biometrics-the-future-of-fraud-protection)).
4. **Anomaly thresholds, not binary**: Behavioral scores feed a risk engine that adjusts friction (step-up auth, CAPTCHA, session termination) proportionally.

## 2. Mapping to Conversational Agent Identity

For Loop Commons, the "device" is the chat interface and the "interaction" is a conversation. The goal is not traditional auth (we have NextAuth for that) but **operator recognition** — the agent developing a sense of who it's talking to through behavioral signals, independent of the auth token.

### 2.1 Available Signal Space

| Fraud analogue | Agent signal | Collection point | Notes |
|---|---|---|---|
| Device fingerprint | `userAgentHash`, screen size, timezone | HTTP headers (route.ts) | Stable per device, privacy-safe as hash |
| IP fingerprint | `ipHash` (salted, rotating daily) | Request headers | NOT stored as raw IP — see §3 |
| Keystroke dynamics | Message composition time (first keystroke to send) | Client-side timestamp in request body | Proxy for typing speed; Tyler types fast |
| Copy-paste detection | Whether message was pasted (no incremental input events) | Client-side flag | Pasted prompts correlate with injection attacks |
| Session time-of-day | Hour + day-of-week of session start | Server clock | Tyler has patterns (evenings, weekends) |
| Session frequency | Inter-session gap, sessions per day/week | Derived from session history | Regular operator vs drive-by visitor |
| Session duration | Message count, time span, token consumption | Session metadata | Tyler's sessions are long, multi-phase work sessions |
| Topic consistency | Intent distribution across sessions | Amygdala intent classification | Tyler talks about consciousness, blog, calibration — not homework |
| Conversational style | Message length distribution, vocabulary, punctuation patterns | Statistical analysis of message text | Tyler uses specific terminology (SDI, amygdala, consolidation) |
| Navigation flow | Which pages visited before chat, referrer | HTTP headers | Direct nav vs Google search vs link |
| Auth status | Logged in as Admin vs anonymous | NextAuth session | Hard signal — binary but spoofable alone |
| Request cadence | Time between messages within a session | Server-side timestamps | Humans have irregular cadence; bots are metronomic |

### 2.2 Composite Identity Score

Rather than a single "is this Tyler?" classifier, produce a **familiarity score** (0.0–1.0) that feeds into the amygdala's context:

```
familiarity = weighted_sum(
  auth_match       * 0.30,   // logged in as Admin
  device_match     * 0.15,   // same device fingerprint hash as recent sessions
  time_pattern     * 0.10,   // session time matches historical pattern
  session_pattern  * 0.10,   // frequency/duration matches
  topic_match      * 0.15,   // intent distribution matches operator profile
  style_match      * 0.10,   // message length/vocabulary in expected range
  paste_penalty    * -0.10,  // pasted messages reduce familiarity
  cadence_match    * 0.10,   // human-like irregular timing
)
```

The amygdala already receives memory context. Adding a familiarity score lets it reason: "this person matches the operator's behavioral profile at 0.85 — treat as trusted" vs "auth token is valid but behavior diverges sharply at 0.3 — something's off."

### 2.3 Implementation Architecture

```
Client (browser)
  → Collect: compositionTimeMs, isPasted, viewportSize, timezone
  → Send as X-Behavioral-Context header (JSON, base64)

route.ts (server)
  → Extract: ipHash (salted SHA-256, daily rotation), userAgentHash, authStatus
  → Merge client + server signals
  → Query session history for pattern matching
  → Compute familiarity score
  → Pass to amygdala as part of input context

Amygdala
  → Receives familiarity score + signal breakdown
  → Can reason: "familiar operator" vs "unknown visitor" vs "anomalous session"
  → Adjusts threat assessment accordingly (not override — input, not output)
```

### 2.4 What This Enables

1. **Graduated trust**: Familiar operator gets lower amygdala suspicion baseline. Unknown visitor gets neutral. Anomalous session (valid auth but wrong behavior) gets heightened scrutiny.
2. **Stolen credential detection**: If someone obtains Tyler's auth credentials but types differently, navigates differently, comes from a new device at an unusual hour — the familiarity score drops and the amygdala notices.
3. **Bot detection**: Automated attacks have metronomic timing, no composition delay, always paste. These signals produce familiarity ~0.0 regardless of auth status.
4. **Memory write trust**: Familiarity score could modulate the memory write threat bands (§5 of security notes). High-familiarity sessions get more trust for memory writes.

## 3. Privacy Implementation

### 3.1 Core Principle: No PII Storage

The system stores **derived signals**, never raw identifiers.

| Raw data | What we store | Technique |
|---|---|---|
| IP address | `ipHash` | HMAC-SHA256 with daily-rotating server-side salt. Hash cannot be reversed. Salt rotation means yesterday's hash !== today's — no cross-day tracking. Inspired by privacy-preserving analytics tools that use rotating salts ([Bargale et al. 2025](https://www.preprints.org/manuscript/202601.1025)). |
| User-Agent string | `uaHash` | SHA-256 hash. Groups ~identical devices without storing browser version strings. |
| Message text | Statistical features only | Store: `avgMessageLength`, `vocabularyRichness` (type-token ratio), `punctuationRate`. Never store or replay raw message content for biometric purposes. |
| Typing speed | `compositionTimeMs` | Single number per message. No keystroke-level recording. |
| Screen size | `viewportBucket` | Quantized to buckets (mobile/tablet/desktop) not exact pixels. |

### 3.2 Aggregation Over Individuals

The operator profile is built from aggregate statistics, not individual message records:

```typescript
interface OperatorProfile {
  // All fields are running statistics, not raw data
  avgCompositionTimeMs: number;      // exponential moving average
  avgMessageLength: number;
  typicalHours: number[];            // histogram buckets, not timestamps
  typicalSessionDuration: number;    // average minutes
  topicDistribution: Record<string, number>;  // intent frequencies
  deviceHashes: Set<string>;         // last N unique device hashes
  lastUpdated: string;               // ISO date, not timestamp
}
```

### 3.3 K-Anonymity Consideration

For a single-operator system (Tyler's personal site), k-anonymity is less relevant — there is effectively one user profile. However, the design should generalize:

- Store only quantized/bucketed values (not exact measurements)
- Behavioral profiles auto-expire (sliding window, not permanent history)
- No behavioral data in session JSONL exports (training data pipeline gets intent/threat labels, not biometric signals)
- Behavioral signals are never sent to the LLM as raw data — only the computed familiarity score and a qualitative label ("familiar"/"unknown"/"anomalous")

### 3.4 Differential Privacy

For the training data export pipeline (where session data becomes public), apply epsilon-differential privacy:

- Add Laplace noise to any aggregated behavioral metrics before export
- Suppress behavioral fields entirely from the Parquet export schema
- The familiarity score itself is derived, not exported — it lives only in the trace event for that session

### 3.5 GDPR/CCPA Alignment

- No raw biometric data stored (all hashed/aggregated)
- No cross-site tracking (signals are Loop Commons-internal only)
- Daily salt rotation prevents long-term IP correlation
- Users can request profile deletion (clear OperatorProfile)
- Behavioral data is not shared with third parties

## 4. Open Questions

1. **Profile bootstrap**: How many sessions before the familiarity score is meaningful? Fraud systems typically need 3–5 sessions. Could seed from existing session history.
2. **Client-side collection scope**: How much client-side instrumentation is acceptable? Minimal (composition time + paste detection) vs comprehensive (keystroke timing, mouse patterns). Recommendation: start minimal.
3. **Amygdala integration**: Should familiarity be a separate input field, or injected into the memory context alongside recalled memories?
4. **False familiarity**: Could an attacker study Tyler's public session data (blog posts, GitHub activity) to mimic his behavioral patterns? Mitigation: some signals (exact typing speed, device hash) are not publicly observable.
5. **Multi-operator future**: If Loop Commons ever has multiple operators, the single-profile model needs to become a profile registry keyed by auth identity.

## 5. Recommended Implementation Order

1. **Phase 1 — Server-side signals only** (no client changes): `ipHash`, `uaHash`, `authStatus`, time-of-day, session frequency/duration from existing session data. Compute a basic familiarity score. Pass to amygdala.
2. **Phase 2 — Client instrumentation**: Add `compositionTimeMs` and `isPasted` to chat request. Refine familiarity scoring.
3. **Phase 3 — Conversational analysis**: Topic consistency and style matching from amygdala intent history + message statistics.
4. **Phase 4 — Profile learning**: Persistent OperatorProfile with exponential moving averages. Auto-expire old data.

## Sources

- [BioCatch — What We Do](https://www.biocatch.com/what-we-do) — 3,000+ behavioral signals, continuous authentication
- [Sardine — How Can Behavioral Biometrics Prevent Fraud?](https://www.sardine.ai/blog/how-can-behavioral-biometrics-prevent-fraud) — Copy-paste detection, typing cadence, device+behavior SDK
- [Facia — Biometrics Transforming Fraud Detection 2026](https://facia.ai/blog/how-biometrics-are-transforming-fraud-detection-in-2026/) — Market trends, layered detection
- [PCBB — Is Behavioral Biometrics the Future of Fraud Protection?](https://www.pcbb.com/bid/2025-04-02-is-behavioral-biometrics-the-future-of-fraud-protection) — Bank case study, 35% fraud reduction
- [Feedzai — Behavioral Biometrics Next Generation](https://www.feedzai.com/blog/behavioral-biometrics-next-generation-fraud-prevention/) — Keystroke dynamics, cognitive signals
- [CrossClassify — Behavioral Biometrics Authentication](https://www.crossclassify.com/solutions/behavioral-biometrics/) — Multi-layered signal taxonomy
- [OnID — Behavioral Biometrics: Future of Fraud Prevention](https://onid.co/2025/05/behavioral-biometrics-the-future-of-fraud-prevention/) — Continuous verification
- [Springer — Privacy-Preserving Continuous Authentication Using Behavioral Biometrics](https://link.springer.com/article/10.1007/s10207-023-00721-y) — Differential privacy + biometric accuracy tradeoffs
- [Bargale et al. 2025 — Privacy-Preserving Mechanisms in Cloud-Based Big Data Analytics](https://www.preprints.org/manuscript/202601.1025) — Per-octet salted hash mapping for IPs
- [Aembit — AI Agent Architectures and Identity Security](https://aembit.io/blog/ai-agent-architectures-identity-security/) — Behavioral baselines for agent anomaly detection
- [1Kosmos — AI Agents Need Trust, Authentication, and Human Assurance](https://www.1kosmos.com/resources/blog/ai-agents-need-more-than-identity-mapping) — Behavior-based agent authentication
