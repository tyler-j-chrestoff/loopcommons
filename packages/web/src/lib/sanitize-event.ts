/**
 * Sanitize trace events before exposing over SSE or API responses.
 *
 * Strips rawResponse (contains Anthropic API headers) from rounds,
 * system prompts from traces, and detailed error messages from tool calls.
 *
 * Amygdala and orchestrator events pass through as-is — they're designed
 * to be educational and contain no secrets. The rewrite diff IS the point.
 */

import type { TraceEvent, Round, Trace } from '@loopcommons/llm';
import type { SessionEvent } from '@/lib/session-writer';

/** Deep-clone a Round and strip rawResponse (contains Anthropic API headers). */
function stripRound(round: Round): Round {
  const { rawResponse, ...safeResponse } = round.response;
  return { ...round, response: safeResponse as Round['response'] };
}

/** Strip rawResponse from all rounds and system prompt from a trace. */
function stripTrace(trace: Trace): Trace {
  const { system: _system, ...safeTrace } = trace;
  return { ...safeTrace, rounds: safeTrace.rounds.map(stripRound) };
}

/** Sanitize a single trace event — strips secrets, headers, system prompts. */
export function sanitizeEvent(event: TraceEvent): TraceEvent {
  if (event.type === 'round:complete') {
    return { ...event, round: stripRound(event.round) };
  }
  if (event.type === 'trace:complete') {
    return { ...event, trace: stripTrace(event.trace) };
  }
  if (event.type === 'tool:complete') {
    return {
      ...event,
      execution: {
        ...event.execution,
        error: event.execution.error ? 'Tool execution failed' : undefined,
      },
    };
  }
  return event;
}

/**
 * Sanitize a session event for public consumption.
 * TraceEvents get full sanitization; other session events pass through.
 */
export function sanitizeSessionEvent(event: SessionEvent): SessionEvent {
  // TraceEvents have a 'type' that matches known trace event types
  if (
    event.type === 'round:complete' ||
    event.type === 'trace:complete' ||
    event.type === 'tool:complete' ||
    event.type === 'tool:start' ||
    event.type === 'round:start' ||
    event.type === 'text-delta'
  ) {
    return sanitizeEvent(event as TraceEvent);
  }
  return event;
}
