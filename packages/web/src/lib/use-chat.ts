'use client';

import { useState, useCallback, useRef } from 'react';
import type { Trace, Round } from '@loopcommons/llm';
import type { ChatMessage, ChatSSEEvent, AmygdalaClassification, RoutingDecision } from './types';

type RateLimitStatus = {
  remaining: number;
  limit: number;
  activeConnections: number;
  concurrencyLimit: number;
  resetMs: number;
};

type SpendStatus = {
  currentSpendUsd: number;
  dailyCapUsd: number;
  remainingUsd: number;
  percentUsed: number;
  resetAtUtc: string;
};

type SecurityEvent = {
  type: 'security:input-sanitized' | 'security:input-rejected';
  reason: string;
  timestamp: number;
};

type UseChatReturn = {
  messages: ChatMessage[];
  trace: Trace | null;
  liveRounds: Round[];
  isLoading: boolean;
  error: string | null;
  rateLimitStatus: RateLimitStatus | null;
  spendStatus: SpendStatus | null;
  securityEvents: SecurityEvent[];
  sessionId: string | null;
  /** Amygdala classification for the current in-flight message */
  liveAmygdala: AmygdalaClassification | null;
  /** Routing decision for the current in-flight message */
  liveRouting: RoutingDecision | null;
  send: (content: string) => void;
  stop: () => void;
};

let msgIdCounter = 0;
function nextId(): string {
  return `msg-${++msgIdCounter}-${Date.now()}`;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [liveRounds, setLiveRounds] = useState<Round[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitStatus | null>(null);
  const [spendStatus, setSpendStatus] = useState<SpendStatus | null>(null);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [liveAmygdala, setLiveAmygdala] = useState<AmygdalaClassification | null>(null);
  const [liveRouting, setLiveRouting] = useState<RoutingDecision | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }, []);

  const send = useCallback((content: string) => {
    if (!content.trim()) return;

    const userMsg: ChatMessage = { id: nextId(), role: 'user', content };
    const assistantId = nextId();

    setMessages(prev => [...prev, userMsg]);
    setError(null);
    setIsLoading(true);
    setLiveRounds([]);
    setTrace(null);
    setLiveAmygdala(null);
    setLiveRouting(null);

    const controller = new AbortController();
    abortRef.current = controller;

    // Build message history for the API
    const apiMessages = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    (async () => {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: 'Request failed' }));
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }

        // Capture session ID from response header
        const respSessionId = res.headers.get('X-Session-Id');
        if (respSessionId) setSessionId(respSessionId);

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantContent = '';
        let completedRounds: Round[] = [];
        let finalTrace: Trace | null = null;
        // Accumulate amygdala classification from multiple events
        let amygdalaData: Partial<AmygdalaClassification> = {};
        let routingData: Partial<RoutingDecision> = {};

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6);

            let event: ChatSSEEvent;
            try {
              event = JSON.parse(json);
            } catch {
              continue;
            }

            if (event.type === 'done') break;

            if (event.type === 'text-delta') {
              assistantContent += event.delta;
              // Update the assistant message in real-time
              setMessages(prev => {
                const existing = prev.find(m => m.id === assistantId);
                if (existing) {
                  return prev.map(m =>
                    m.id === assistantId ? { ...m, content: assistantContent } : m
                  );
                }
                return [...prev, { id: assistantId, role: 'assistant' as const, content: assistantContent }];
              });
            } else if (event.type === 'round:complete') {
              const round = event.round;
              completedRounds = [...completedRounds, round];
              // Only overwrite if round has content and we haven't streamed text
              if (round.response.content && !assistantContent) {
                assistantContent = round.response.content;
              }
              setLiveRounds([...completedRounds]);
            } else if (event.type === 'trace:complete') {
              finalTrace = event.trace;
              if (!assistantContent) {
                assistantContent = finalTrace.rounds.at(-1)?.response.content || assistantContent;
              }
              setTrace(finalTrace);
            } else if (event.type === 'rate-limit:status') {
              setRateLimitStatus({
                remaining: event.remaining,
                limit: event.limit,
                activeConnections: event.activeConnections,
                concurrencyLimit: event.concurrencyLimit,
                resetMs: event.resetMs,
              });
            } else if (event.type === 'spend:status') {
              setSpendStatus({
                currentSpendUsd: event.currentSpendUsd,
                dailyCapUsd: event.dailyCapUsd,
                remainingUsd: event.remainingUsd,
                percentUsed: event.percentUsed,
                resetAtUtc: event.resetAtUtc,
              });
            } else if (event.type === 'security:input-sanitized' || event.type === 'security:input-rejected') {
              setSecurityEvents(prev => [...prev, { type: event.type, reason: event.reason, timestamp: event.timestamp }]);
            } else if (event.type === 'session:start') {
              setSessionId(event.sessionId);
            } else if (event.type === 'amygdala:rewrite') {
              amygdalaData = {
                ...amygdalaData,
                rewriteModified: event.modified,
                originalPrompt: event.originalPrompt,
                rewrittenPrompt: event.rewrittenPrompt,
              };
              setLiveAmygdala(amygdalaData as AmygdalaClassification);
            } else if (event.type === 'amygdala:classify') {
              amygdalaData = {
                ...amygdalaData,
                intent: event.intent,
                confidence: event.confidence,
              };
              setLiveAmygdala(amygdalaData as AmygdalaClassification);
            } else if (event.type === 'amygdala:threat-assess') {
              amygdalaData = {
                ...amygdalaData,
                threatScore: event.threat.score,
                threatCategory: event.threat.category,
                threatReasoning: event.threat.reasoning,
              };
              setLiveAmygdala(amygdalaData as AmygdalaClassification);
            } else if (event.type === 'orchestrator:route') {
              routingData = {
                ...routingData,
                subagentId: event.subagentId,
                subagentName: event.subagentName,
                threatOverride: event.threatOverride,
                allowedTools: event.allowedTools,
                reasoning: event.reasoning,
              };
              setLiveRouting(routingData as RoutingDecision);
            } else if (event.type === 'orchestrator:context-filter') {
              routingData = {
                ...routingData,
                totalMessages: event.totalMessages,
                delegatedMessages: event.delegatedMessages,
                deliveredMessages: event.deliveredMessages,
                usedSummary: event.usedSummary,
              };
              setLiveRouting(routingData as RoutingDecision);
            } else if (event.type === 'error') {
              setError(event.error);
            }
          }
        }

        // Finalize assistant message with trace + amygdala + routing data.
        // If the response is empty (hard defect — adversarial user gets silence),
        // don't add an assistant bubble at all. The user talks to themselves.
        // The amygdala/routing data still updates in the sidebar inspector.
        if (!assistantContent) {
          // No bubble, but still update live amygdala/routing state for the inspector
          setMessages(prev => prev.filter(m => m.id !== assistantId));
        } else {
          const assistantMsg: ChatMessage = {
            id: assistantId,
            role: 'assistant',
            content: assistantContent,
            trace: finalTrace ?? undefined,
            rounds: completedRounds,
            cost: finalTrace?.totalCost,
            amygdala: amygdalaData.intent ? amygdalaData as AmygdalaClassification : undefined,
            routing: routingData.subagentId ? routingData as RoutingDecision : undefined,
            sessionId: respSessionId ?? undefined,
          };
          setMessages(prev => {
            const existing = prev.find(m => m.id === assistantId);
            if (existing) {
              return prev.map(m => m.id === assistantId ? assistantMsg : m);
            }
            return [...prev, assistantMsg];
          });
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError((err as Error).message);
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    })();
  }, [messages]);

  return { messages, trace, liveRounds, isLoading, error, rateLimitStatus, spendStatus, securityEvents, sessionId, liveAmygdala, liveRouting, send, stop };
}
