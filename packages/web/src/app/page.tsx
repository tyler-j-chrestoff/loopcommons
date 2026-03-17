'use client';

import { useChat } from '@/lib/use-chat';
import { Layout } from '@/components/Layout';
import { ChatThread } from '@/components/ChatThread';
import { ChatInput } from '@/components/ChatInput';
import { TraceInspector } from '@/components/TraceInspector';
import { CostDashboard } from '@/components/CostDashboard';
import { ToolCallInline } from '@/components/ToolCallInline';
import type { ChatMessage } from '@/lib/types';

function renderToolCalls(message: ChatMessage) {
  if (!message.rounds || message.role !== 'assistant') return null;
  const toolExecutions = message.rounds.flatMap(r => r.toolExecutions);
  if (toolExecutions.length === 0) return null;

  return (
    <div className="mt-2">
      {toolExecutions.map(te => (
        <ToolCallInline key={te.toolCallId} execution={te} />
      ))}
    </div>
  );
}

export default function Home() {
  const { messages, trace, liveRounds, isLoading, error, send, stop } = useChat();

  return (
    <Layout
      header={<CostDashboard messages={messages} />}
      main={
        <>
          <ChatThread
            messages={messages}
            isLoading={isLoading}
            renderToolCalls={renderToolCalls}
          />
          {error && (
            <div className="border-t border-error/30 bg-error/10 px-4 py-2 text-sm text-error">
              {error}
            </div>
          )}
          <ChatInput onSend={send} onStop={stop} isLoading={isLoading} />
        </>
      }
      sidebar={<TraceInspector trace={trace} liveRounds={liveRounds} />}
    />
  );
}
