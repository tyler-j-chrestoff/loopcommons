/**
 * Streaming filter that strips <thinking>...</thinking> blocks from
 * LLM text output.
 *
 * The model sometimes emits thinking tags as literal text (not via
 * Anthropic's structured extended thinking API). This filter buffers
 * incoming deltas and suppresses content between <thinking> and
 * </thinking> tags, even when split across multiple chunks.
 */

const OPEN_TAG = '<thinking>';
const CLOSE_TAG = '</thinking>';

export interface ThinkingFilter {
  /** Process an incoming text chunk. Returns zero or more output chunks. */
  push(chunk: string): string[];
  /** Flush any buffered content (call at end of stream). */
  flush(): string[];
}

export function createThinkingFilter(): ThinkingFilter {
  let buffer = '';
  let inside = false;

  return {
    push(chunk: string): string[] {
      buffer += chunk;
      const out: string[] = [];

      for (;;) {
        if (inside) {
          // Looking for </thinking>
          const closeIdx = buffer.indexOf(CLOSE_TAG);
          if (closeIdx !== -1) {
            // Found close tag — discard everything up to and including it
            buffer = buffer.slice(closeIdx + CLOSE_TAG.length);
            inside = false;
            continue;
          }
          // Check if buffer ends with a partial close tag
          if (couldBePartialTag(buffer, CLOSE_TAG)) {
            // Keep buffering — might be a partial </thinking>
            return out;
          }
          // No close tag and no partial — discard the buffer (still inside thinking)
          buffer = '';
          return out;
        }

        // Not inside a thinking block
        const openIdx = buffer.indexOf(OPEN_TAG);
        if (openIdx !== -1) {
          // Found open tag — emit everything before it, enter thinking mode
          if (openIdx > 0) {
            out.push(buffer.slice(0, openIdx));
          }
          buffer = buffer.slice(openIdx + OPEN_TAG.length);
          inside = true;
          continue;
        }

        // Check if buffer ends with a partial <thinking> tag
        if (couldBePartialTag(buffer, OPEN_TAG)) {
          // Emit everything except the potential partial tag
          const partialLen = partialTagLength(buffer, OPEN_TAG);
          const safe = buffer.slice(0, buffer.length - partialLen);
          if (safe.length > 0) {
            out.push(safe);
          }
          buffer = buffer.slice(buffer.length - partialLen);
          return out;
        }

        // No tag, no partial — emit everything
        if (buffer.length > 0) {
          out.push(buffer);
          buffer = '';
        }
        return out;
      }
    },

    flush(): string[] {
      if (buffer.length === 0) return [];
      if (inside) {
        // Unclosed thinking block — discard remaining buffer
        buffer = '';
        return [];
      }
      const remaining = buffer;
      buffer = '';
      return [remaining];
    },
  };
}

/** Strip all <thinking>...</thinking> blocks from a complete string. */
export function stripThinkingTags(text: string): string {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
}

/**
 * Check if the end of `text` could be the start of `tag`.
 * e.g., text="foo <thin" could be the start of "<thinking>".
 */
function couldBePartialTag(text: string, tag: string): boolean {
  return partialTagLength(text, tag) > 0;
}

function partialTagLength(text: string, tag: string): number {
  // Check if text ends with tag[0..k] for some k >= 1
  const maxCheck = Math.min(text.length, tag.length - 1);
  for (let k = maxCheck; k >= 1; k--) {
    if (text.endsWith(tag.slice(0, k))) {
      return k;
    }
  }
  return 0;
}
