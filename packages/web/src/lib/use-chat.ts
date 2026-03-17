'use client';

import { useState, useCallback, useRef } from 'react';
import type { Trace, Round } from '@loopcommons/llm';
import type { ChatMessage, ChatSSEEvent } from './types';

type UseChatReturn = {
  messages: ChatMessage[];
  trace: Trace | null;
  liveRounds: Round[];
  isLoading: boolean;
  error: string | null;
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

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantContent = '';
        let completedRounds: Round[] = [];
        let finalTrace: Trace | null = null;

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
            } else if (event.type === 'error') {
              setError(event.error);
            }
          }
        }

        // Finalize assistant message with trace data
        const assistantMsg: ChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: assistantContent || '[No response]',
          trace: finalTrace ?? undefined,
          rounds: completedRounds,
          cost: finalTrace?.totalCost,
        };
        setMessages(prev => {
          const existing = prev.find(m => m.id === assistantId);
          if (existing) {
            return prev.map(m => m.id === assistantId ? assistantMsg : m);
          }
          return [...prev, assistantMsg];
        });
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

  return { messages, trace, liveRounds, isLoading, error, send, stop };
}
