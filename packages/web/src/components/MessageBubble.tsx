'use client';

import type { ChatMessage } from '@/lib/types';
import { formatCost } from '@/lib/format';

type MessageBubbleProps = {
  message: ChatMessage;
  children?: React.ReactNode;
};

export function MessageBubble({ message, children }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-user-bubble text-text'
            : 'bg-assistant-bubble border border-border-subtle text-text'
        }`}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        {children}
        {message.cost != null && message.cost > 0 && (
          <span className="mt-2 inline-block rounded bg-bg-hover px-1.5 py-0.5 text-xs text-text-muted">
            {formatCost(message.cost)}
          </span>
        )}
      </div>
    </div>
  );
}
