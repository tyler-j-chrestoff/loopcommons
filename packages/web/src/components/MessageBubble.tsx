'use client';

import type { ChatMessage } from '@/lib/types';
import { formatCost } from '@/lib/format';
import { FeedbackButtons } from './FeedbackButtons';
import { FeedbackBadge } from './FeedbackBadge';

type MessageBubbleProps = {
  message: ChatMessage;
  children?: React.ReactNode;
  onFeedback?: (payload: { messageId: string; sessionId: string; rating: 'positive' | 'negative'; category?: string }) => void;
};

export function MessageBubble({ message, children, onFeedback }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`group flex ${isUser ? 'justify-end' : 'justify-start'}`}>
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
        {!isUser && message.feedback && (
          <div className="mt-2">
            <FeedbackBadge feedback={message.feedback} />
          </div>
        )}
        {!isUser && onFeedback && message.sessionId && !message.feedback && (
          <div className="opacity-0 transition-opacity group-hover:opacity-100">
            <FeedbackButtons
              messageId={message.id}
              sessionId={message.sessionId}
              onSubmit={onFeedback}
            />
          </div>
        )}
      </div>
    </div>
  );
}
