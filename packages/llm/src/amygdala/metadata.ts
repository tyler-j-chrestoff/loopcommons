/**
 * metadata.ts — Privacy-preserving request metadata utilities.
 *
 * soul-04: Helpers for hashing PII (IP addresses, user-agent strings)
 * before passing to the amygdala as identity consistency signals.
 */

import { createHash } from 'crypto';

/**
 * Hash a string using SHA-256 for privacy-preserving storage.
 * Used for IP addresses and user-agent strings — the hash is
 * consistent (same input → same output) but irreversible.
 */
export function hashForPrivacy(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
