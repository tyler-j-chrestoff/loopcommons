'use client';

import Markdown from 'react-markdown';
import type { ChatMessage } from '@/lib/types';
import { formatCost } from '@/lib/format';
import { FeedbackButtons } from './FeedbackButtons';
import { FeedbackBadge } from './FeedbackBadge';
import { ToolCallInline } from './ToolCallInline';

type MessageBubbleProps = {
  message: ChatMessage;
  children?: React.ReactNode;
  onFeedback?: (payload: { messageId: string; sessionId: string; rating: 'positive' | 'negative'; category?: string }) => void;
};

export function MessageBubble({ message, children, onFeedback }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  // Render segments inline (text + tool calls interleaved) or fall back to plain content
  const hasSegments = !isUser && message.segments && message.segments.length > 0;

  return (
    <div className={`group flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-user-bubble text-text'
            : 'bg-assistant-bubble border border-border-subtle text-text'
        }`}
      >
        {hasSegments ? (
          message.segments!.map((seg, i) =>
            seg.type === 'text' ? (
              <div key={i} className="chat-prose text-sm leading-relaxed">
                <Markdown>{seg.content}</Markdown>
              </div>
            ) : (
              <div key={i} className="my-2">
                {seg.executions.map(te => (
                  <ToolCallInline key={te.toolCallId} execution={te} />
                ))}
              </div>
            )
          )
        ) : (
          <div className="chat-prose text-sm leading-relaxed">
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <Markdown>{message.content}</Markdown>
            )}
          </div>
        )}
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
