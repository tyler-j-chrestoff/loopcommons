'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/lib/types';
import { MessageBubble } from './MessageBubble';

type ChatThreadProps = {
  messages: ChatMessage[];
  isLoading: boolean;
  onFeedback?: (payload: { messageId: string; sessionId: string; rating: 'positive' | 'negative'; category?: string }) => void;
};

export function ChatThread({ messages, isLoading, onFeedback }: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-text-secondary">Loop Commons</p>
          <p className="mt-1 text-sm text-text-muted">Send a message to start a conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} onFeedback={onFeedback} />
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-lg border border-border-subtle bg-assistant-bubble px-4 py-3">
              <span className="animate-pulse text-sm text-text-muted">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
