import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Layout } from '@/components/Layout';
import { ChatInput } from '@/components/ChatInput';
import { ChatThread } from '@/components/ChatThread';
import { MessageBubble } from '@/components/MessageBubble';
import { ToolCallInline } from '@/components/ToolCallInline';
import type { ChatMessage } from '@/lib/types';
import type { ToolExecution } from '@loopcommons/llm';

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
describe('Layout', () => {
  it('renders header content', () => {
    render(
      <Layout
        header={<span>Test Header</span>}
        main={<div>Main Content</div>}
        sidebar={<div>Sidebar</div>}
      />,
    );
    expect(screen.getByText('Test Header')).toBeInTheDocument();
  });

  it('renders main content', () => {
    render(
      <Layout
        header={<span>H</span>}
        main={<div>Main Area</div>}
        sidebar={<div>S</div>}
      />,
    );
    expect(screen.getByText('Main Area')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ChatInput
// ---------------------------------------------------------------------------
describe('ChatInput', () => {
  const defaultProps = {
    onSend: vi.fn(),
    onStop: vi.fn(),
    isLoading: false,
  };

  it('renders a text input field', () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByPlaceholderText('Send a message...')).toBeInTheDocument();
  });

  it('renders a submit button', () => {
    render(<ChatInput {...defaultProps} />);
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('renders a stop button when loading', () => {
    render(<ChatInput {...defaultProps} isLoading={true} />);
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ChatThread
// ---------------------------------------------------------------------------
describe('ChatThread', () => {
  it('renders empty state when no messages', () => {
    render(<ChatThread messages={[]} isLoading={false} />);
    expect(screen.getByText('Send a message to start a conversation')).toBeInTheDocument();
  });

  it('renders messages', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'user', content: 'Hello there' },
      { id: '2', role: 'assistant', content: 'Hi back' },
    ];
    render(<ChatThread messages={messages} isLoading={false} />);
    expect(screen.getByText('Hello there')).toBeInTheDocument();
    expect(screen.getByText('Hi back')).toBeInTheDocument();
  });

  it('shows thinking indicator when loading', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'user', content: 'Question' },
    ];
    render(<ChatThread messages={messages} isLoading={true} />);
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------
describe('MessageBubble', () => {
  it('renders user message content', () => {
    const msg: ChatMessage = { id: '1', role: 'user', content: 'User says hello' };
    render(<MessageBubble message={msg} />);
    expect(screen.getByText('User says hello')).toBeInTheDocument();
  });

  it('renders assistant message content', () => {
    const msg: ChatMessage = { id: '2', role: 'assistant', content: 'Assistant responds' };
    render(<MessageBubble message={msg} />);
    expect(screen.getByText('Assistant responds')).toBeInTheDocument();
  });

  it('renders cost badge when cost is present', () => {
    const msg: ChatMessage = { id: '3', role: 'assistant', content: 'Costly reply', cost: 0.005 };
    render(<MessageBubble message={msg} />);
    expect(screen.getByText('$0.0050')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ToolCallInline
// ---------------------------------------------------------------------------
describe('ToolCallInline', () => {
  const execution: ToolExecution = {
    toolCallId: 'tc-1',
    toolName: 'get_resume',
    input: { section: 'skills' },
    output: '{"skills": ["TypeScript"]}',
    startedAt: 1000,
    completedAt: 1250,
    latencyMs: 250,
  };

  it('renders tool name', () => {
    render(<ToolCallInline execution={execution} />);
    expect(screen.getByText('get_resume')).toBeInTheDocument();
  });

  it('renders latency', () => {
    render(<ToolCallInline execution={execution} />);
    expect(screen.getByText('250ms')).toBeInTheDocument();
  });
});
