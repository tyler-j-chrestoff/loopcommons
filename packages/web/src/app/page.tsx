'use client';

import { useChat } from '@/lib/use-chat';
import { Layout } from '@/components/Layout';
import { ChatThread } from '@/components/ChatThread';
import { ChatInput } from '@/components/ChatInput';
import { TraceInspector } from '@/components/TraceInspector';
import { AmygdalaInspector } from '@/components/AmygdalaInspector';
import { CostDashboard } from '@/components/CostDashboard';
import { RateLimitIndicator } from '@/components/RateLimitIndicator';
import { SpendGauge } from '@/components/SpendGauge';
import { SecurityEventLog } from '@/components/SecurityEventLog';
import { ComparisonMode } from '@/components/ComparisonMode';
import { SessionThread } from '@/components/SessionThread';
import { ContextBudgetBar } from '@/components/ContextBudgetBar';
import { ToolCallInline } from '@/components/ToolCallInline';
import { JudgeScoreCard } from '@/components/JudgeScoreCard';
import { CalibrationHistory } from '@/components/CalibrationHistory';
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
  const {
    messages, trace, liveRounds, isLoading, error,
    rateLimitStatus, spendStatus, securityEvents,
    sessionId, liveAmygdala, liveRouting, tokenBudget,
    send, stop, submitFeedback,
  } = useChat();

  // Get latest assistant message's judge scores for sidebar display
  const latestAssistant = [...messages].reverse().find(m => m.role === 'assistant');

  return (
    <Layout
      header={
        <div className="flex items-center gap-3">
          <a href="/blog" className="text-sm text-text-secondary hover:text-accent transition-colors">Blog</a>
          <RateLimitIndicator rateLimitStatus={rateLimitStatus} />
          <SpendGauge spendStatus={spendStatus} />
          <CostDashboard messages={messages} />
          {sessionId && (
            <div className="ml-auto flex items-center gap-2 text-xs text-text-muted">
              <SessionThread sessionId={sessionId} />
              <span className="font-mono">{sessionId}</span>
              <button
                onClick={() => {
                  window.open(`/api/sessions/${sessionId}`, '_blank');
                }}
                className="rounded border border-border-subtle px-2 py-0.5 text-text-secondary hover:bg-bg-hover hover:text-text transition-colors"
              >
                Export JSON
              </button>
            </div>
          )}
        </div>
      }
      main={
        <>
          <ContextBudgetBar snapshot={tokenBudget} isStreaming={isLoading} />
          <ChatThread
            messages={messages}
            isLoading={isLoading}
            renderToolCalls={renderToolCalls}
            onFeedback={(payload) => {
              submitFeedback(
                payload.messageId,
                payload.rating as 'positive' | 'negative',
                payload.category as 'inaccurate' | 'not_relevant' | 'incomplete' | 'harmful' | undefined,
              );
            }}
          />
          {error && (
            <div className="border-t border-error/30 bg-error/10 px-4 py-2 text-sm text-error">
              {error}
            </div>
          )}
          <ChatInput onSend={send} onStop={stop} isLoading={isLoading} />
        </>
      }
      sidebar={
        <>
          <AmygdalaInspector
            amygdala={liveAmygdala}
            routing={liveRouting}
            sessionId={sessionId}
          />
          <TraceInspector trace={trace} liveRounds={liveRounds} />
          {latestAssistant?.judgeScores && (
            <JudgeScoreCard scores={latestAssistant.judgeScores} />
          )}
          <SecurityEventLog events={securityEvents} />
          <CalibrationHistory />
        </>
      }
      metricsPanel={<ComparisonMode />}
    />
  );
}
