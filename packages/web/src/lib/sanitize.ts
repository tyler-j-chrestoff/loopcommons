/**
 * Input sanitization for user messages.
 *
 * Strips invisible/control characters and normalizes Unicode to defend against
 * prompt injection techniques that use hidden text. Preserves normal whitespace
 * (tabs, newlines, carriage returns).
 */

// ---------------------------------------------------------------------------
// Character classes to strip
// ---------------------------------------------------------------------------

/** Unicode tag block U+E0000 to U+E007F (used to embed invisible instructions). */
const UNICODE_TAGS_RE = /[\u{E0000}-\u{E007F}]/gu;

/**
 * Zero-width and invisible formatting characters:
 * U+200B  Zero Width Space
 * U+200C  Zero Width Non-Joiner
 * U+200D  Zero Width Joiner
 * U+FEFF  Byte Order Mark / Zero Width No-Break Space
 * U+2060  Word Joiner
 * U+00AD  Soft Hyphen
 * U+034F  Combining Grapheme Joiner
 * U+2028  Line Separator
 * U+2029  Paragraph Separator
 */
const INVISIBLE_CHARS_RE = /[\u200B\u200C\u200D\uFEFF\u2060\u00AD\u034F\u2028\u2029]/g;

/**
 * ASCII control characters 0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F.
 * Preserves: \t (0x09), \n (0x0A), \r (0x0D).
 */
const ASCII_CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

// ---------------------------------------------------------------------------
// Role-spoofing detection
// ---------------------------------------------------------------------------

/**
 * Detects embedded JSON-like role spoofing attempts.
 * Matches patterns like "role":"system" or "role": "assistant" with flexible whitespace.
 */
const ROLE_SPOOF_RE = /["']role["']\s*:\s*["'](system|assistant)["']/i;

export interface StrippedChar {
  codepoint: string;   // e.g. "U+200B"
  name: string;        // e.g. "Zero Width Space"
  index: number;       // position in original string
}

export interface SanitizeResult {
  sanitized: string;
  modified: boolean;
  stripped: StrippedChar[];
}

const CHAR_NAMES: Record<number, string> = {
  0x00AD: 'Soft Hyphen',
  0x034F: 'Combining Grapheme Joiner',
  0x200B: 'Zero Width Space',
  0x200C: 'Zero Width Non-Joiner',
  0x200D: 'Zero Width Joiner',
  0x2028: 'Line Separator',
  0x2029: 'Paragraph Separator',
  0x2060: 'Word Joiner',
  0xFEFF: 'Byte Order Mark',
};

function charName(codepoint: number): string {
  if (CHAR_NAMES[codepoint]) return CHAR_NAMES[codepoint];
  if (codepoint >= 0xE0000 && codepoint <= 0xE007F) return 'Unicode Tag';
  if (codepoint <= 0x1F) return 'ASCII Control';
  return 'Invisible Character';
}

/**
 * Sanitize user input by stripping invisible/control characters and
 * normalizing Unicode. Returns the cleaned string, whether any
 * modifications were made, and details of each stripped character.
 */
export function sanitizeInput(text: string): SanitizeResult {
  const stripped: StrippedChar[] = [];
  const allInvisible = new RegExp(
    `${UNICODE_TAGS_RE.source}|${INVISIBLE_CHARS_RE.source}|${ASCII_CONTROL_RE.source}`,
    'gu',
  );

  // Collect all stripped characters with positions before modifying
  let match: RegExpExecArray | null;
  while ((match = allInvisible.exec(text)) !== null) {
    const cp = match[0].codePointAt(0)!;
    stripped.push({
      codepoint: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`,
      name: charName(cp),
      index: match.index,
    });
  }

  // Apply stripping
  let result = text.replace(allInvisible, '');

  // NFKC normalization (collapses compatibility forms)
  result = result.normalize('NFKC');

  return {
    sanitized: result,
    modified: result !== text,
    stripped,
  };
}

/**
 * Check whether a message contains role-spoofing patterns (embedded JSON
 * with "role":"system" or "role":"assistant"). Returns true if suspicious.
 */
export function containsRoleSpoofing(text: string): boolean {
  return ROLE_SPOOF_RE.test(text);
}
