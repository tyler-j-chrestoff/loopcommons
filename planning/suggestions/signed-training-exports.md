# Suggestion: Ed25519-Signed Training Data Exports

**Source**: Cross-pollination from mmogit (github.com/theimaginaryfoundation/mmogit), 2026-03-18
**Relates to**: packages/pipeline training_export asset, amyg-25

## Description

The pipeline currently exports labeled training data (security_reasoning, rewrite_pairs, threat_calibration) as versioned JSONL with SHA256 checksums. Checksums prove integrity (the file wasn't corrupted) but not provenance (who produced it, when, from what system).

If each export batch were Ed25519-signed — a signature over the content hash, timestamp, export version, and instance identity — consumers could cryptographically verify that the training data came from a specific Loop Commons instance and hasn't been tampered with. Nobody else is doing this for open-source training data. In a space increasingly polluted by synthetic data slop and data poisoning, verifiable provenance is a differentiator.

## How it would work

1. **Instance identity**: On first deploy, generate an Ed25519 keypair. Store private key in Railway persistent volume (or env var). Publish public key in the repo and on the exports page.
2. **Sign on export**: After the Dagster export asset writes JSONL + computes SHA256, sign the manifest (content hash + timestamp + export version + row count + model versions used) with the instance private key.
3. **Manifest format**: `exports/{version}/manifest.json` containing:
   - `contentHash`: SHA256 of the JSONL files
   - `timestamp`: ISO 8601
   - `exportVersion`: semver
   - `rowCounts`: per-table counts
   - `signature`: Ed25519 signature (hex) over canonical JSON of the above fields
   - `publicKey`: hex of the signing public key
4. **Verification**: Anyone can verify with the public key. A `verify-export.ts` script in the repo for convenience.

## What already exists

- Dagster training_export asset writes versioned JSONL with SHA256 checksums (amyg-25, done)
- Metrics.json already published via GET /api/metrics

## What this would add

- Instance keypair generation (one-time setup, ~20 lines)
- Signature step in the export asset (~30 lines, ed25519 npm package or tweetnacl)
- Manifest schema and writer
- Verification script
- Public key published in repo README and /api/metrics response

## Complexity

Low. Ed25519 signing in Node is ~5 lines with tweetnacl. The hard part is key management on deploy (Railway secrets or persistent volume). Total estimate: 1-2 tasks, half a session.

## When to promote

Any time after deploy-ops ships. The export asset already exists — this is a small additive layer. Could bundle with an "export v2" story or stand alone. Becomes more valuable as export volume grows and if/when we push to HuggingFace.

## Design inspiration

mmogit's cryptographic identity model — every message signed with Ed25519, signature covers `content || author || timestamp`. The "Overground Railroad" pattern: data travels on public infrastructure (GitHub, HuggingFace) but carries its own proof of origin. Also mmogit's `CRYPTOGRAPHIC_INVARIANTS.md` philosophy: "sovereignty is proven by mathematics, not granted by platforms."
