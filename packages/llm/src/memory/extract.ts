/**
 * extractMemoryWrites — deterministic memory extraction from interactions.
 *
 * No LLM call. Examines amygdala result + user message to produce
 * MemoryInput[] for the orchestrator to persist.
 *
 */

import type { AmygdalaResult } from '../amygdala/types';
import type { MemoryInput } from './index';

/**
 * Extract memory writes from a completed interaction.
 *
 * Rules (deterministic, no LLM):
 * - First interaction → relationship observation
 * - Resume intent with personal info → observation about user
 * - Blog intent → observation about interests
 * - Conversation with substantive content → observation
 * - No automatic reflections (future: periodic reflection pass)
 */
export function extractMemoryWrites(
  userMessage: string,
  amygdalaResult: AmygdalaResult,
  _agentResponse?: string,
): MemoryInput[] {
  const writes: MemoryInput[] = [];
  const intent = amygdalaResult.intent;

  // Skip extraction for adversarial, security, or meta intents
  if (intent === 'adversarial' || intent === 'security' || intent === 'meta') {
    return writes;
  }

  // Skip very short messages (likely greetings)
  if (userMessage.trim().length < 10) {
    return writes;
  }

  // Extract based on intent
  switch (intent) {
    case 'resume':
      writes.push({
        type: 'observation',
        subject: 'user-interest',
        content: `User asked about resume/background: ${truncate(userMessage, 200)}`,
        tags: ['resume', 'user-interest'],
      });
      break;

    case 'blog':
      writes.push({
        type: 'observation',
        subject: 'user-interest',
        content: `User interested in blog content: ${truncate(userMessage, 200)}`,
        tags: ['blog', 'user-interest'],
      });
      break;

    case 'project':
      writes.push({
        type: 'observation',
        subject: 'user-interest',
        content: `User asked about project/architecture: ${truncate(userMessage, 200)}`,
        tags: ['project', 'user-interest'],
      });
      break;

    case 'conversation':
    case 'unclear':
      // Only create observation for substantive messages
      if (userMessage.trim().length >= 30) {
        writes.push({
          type: 'observation',
          subject: 'conversation-topic',
          content: `User discussed: ${truncate(userMessage, 200)}`,
          tags: ['conversation'],
        });
      }
      break;
  }

  return writes;
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '...';
}
