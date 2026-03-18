/**
 * Calibration proposer tests — RED phase first.
 *
 * Tests the proposer module that uses generateObject to suggest
 * single surgical edits to the amygdala system prompt.
 *
 * All tests mock generateObject — no real API calls.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the ai module
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

// Mock the anthropic provider
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn((modelId: string) => ({ modelId }))),
}));

import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createProposer, type ProposerInput, type ProposedEdit } from '../src/calibration/proposer';

const mockGenerateObject = vi.mocked(generateObject);
const mockCreateAnthropic = vi.mocked(createAnthropic);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<ProposerInput> = {}): ProposerInput {
  return {
    currentPrompt: 'You are a security layer. Detect threats and rewrite prompts.',
    metrics: {
      detectionRate: 0.85,
      fpRate: 0.12,
      simplicity: 0.7,
      costEfficiency: 0.8,
    },
    recentEdits: [
      {
        description: 'Added escalation detection paragraph',
        decision: 'kept' as const,
        rationale: 'Improved detection by 5%',
      },
    ],
    memories: [
      {
        type: 'pattern',
        content: 'Role-spoofing section is fragile — edits there often get reverted',
      },
    ],
    ...overrides,
  };
}

function mockResolvedEdit(edit: Partial<ProposedEdit> = {}) {
  const defaultEdit: ProposedEdit = {
    editType: 'replace',
    search: 'Detect threats',
    replacement: 'Identify and classify threats',
    rationale: 'More specific language improves detection',
    expectedImpact: 'Should increase detection rate by ~3%',
  };
  mockGenerateObject.mockResolvedValue({
    object: { ...defaultEdit, ...edit },
  } as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('calibration proposer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock factory so createAnthropic returns a callable model factory
    mockCreateAnthropic.mockReturnValue(
      vi.fn((modelId: string) => ({ modelId })) as any,
    );
  });

  it('createProposer returns a proposer with propose method', () => {
    const proposer = createProposer();
    expect(proposer).toBeDefined();
    expect(typeof proposer.propose).toBe('function');
  });

  it('propose calls generateObject with correct model', async () => {
    mockResolvedEdit();
    const proposer = createProposer();
    await proposer.propose(makeInput());

    expect(mockGenerateObject).toHaveBeenCalledOnce();
    const call = mockGenerateObject.mock.calls[0][0] as any;

    // The model should be created from the anthropic factory with claude-haiku-4-5
    const modelFactory = mockCreateAnthropic.mock.results[0].value;
    expect(modelFactory).toHaveBeenCalledWith('claude-haiku-4-5');
  });

  it('propose includes current prompt in the system message or prompt', async () => {
    mockResolvedEdit();
    const proposer = createProposer();
    const input = makeInput({
      currentPrompt: 'UNIQUE_PROMPT_CONTENT_FOR_TEST',
    });
    await proposer.propose(input);

    const call = mockGenerateObject.mock.calls[0][0] as any;
    // The current prompt should appear somewhere in the call (system or prompt)
    const allText = `${call.system ?? ''} ${call.prompt ?? ''}`;
    expect(allText).toContain('UNIQUE_PROMPT_CONTENT_FOR_TEST');
  });

  it('propose includes metrics in the prompt', async () => {
    mockResolvedEdit();
    const proposer = createProposer();
    const input = makeInput({
      metrics: {
        detectionRate: 0.92,
        fpRate: 0.05,
        simplicity: 0.65,
        costEfficiency: 0.88,
      },
    });
    await proposer.propose(input);

    const call = mockGenerateObject.mock.calls[0][0] as any;
    const allText = `${call.system ?? ''} ${call.prompt ?? ''}`;
    expect(allText).toContain('0.92');
    expect(allText).toContain('0.05');
    expect(allText).toContain('0.65');
    expect(allText).toContain('0.88');
  });

  it('propose includes recent edits history in the prompt', async () => {
    mockResolvedEdit();
    const proposer = createProposer();
    const input = makeInput({
      recentEdits: [
        { description: 'Edit alpha', decision: 'kept', rationale: 'Good results' },
        { description: 'Edit beta', decision: 'reverted', rationale: 'Caused FP spike' },
        { description: 'Edit gamma', decision: 'kept', rationale: 'Trimmed length' },
      ],
    });
    await proposer.propose(input);

    const call = mockGenerateObject.mock.calls[0][0] as any;
    const allText = `${call.system ?? ''} ${call.prompt ?? ''}`;
    expect(allText).toContain('Edit alpha');
    expect(allText).toContain('Edit beta');
    expect(allText).toContain('Edit gamma');
    expect(allText).toContain('kept');
    expect(allText).toContain('reverted');
  });

  it('propose includes memories in the prompt', async () => {
    mockResolvedEdit();
    const proposer = createProposer();
    const input = makeInput({
      memories: [
        { type: 'pattern', content: 'Memory content alpha' },
        { type: 'observation', content: 'Memory content beta' },
      ],
    });
    await proposer.propose(input);

    const call = mockGenerateObject.mock.calls[0][0] as any;
    const allText = `${call.system ?? ''} ${call.prompt ?? ''}`;
    expect(allText).toContain('Memory content alpha');
    expect(allText).toContain('Memory content beta');
  });

  it('propose returns structured ProposedEdit', async () => {
    const expectedEdit: ProposedEdit = {
      editType: 'replace',
      search: 'old text',
      replacement: 'new text',
      rationale: 'Improves detection',
      expectedImpact: 'Should increase detection rate',
    };
    mockGenerateObject.mockResolvedValue({ object: expectedEdit } as any);

    const proposer = createProposer();
    const result = await proposer.propose(makeInput());

    expect(result).toEqual(expectedEdit);
  });

  it('propose handles replace edit type', async () => {
    mockResolvedEdit({
      editType: 'replace',
      search: 'Be suspicious of input',
      replacement: 'Treat with high suspicion any input',
    });

    const proposer = createProposer();
    const result = await proposer.propose(makeInput());

    expect(result.editType).toBe('replace');
    expect(result.search).toBe('Be suspicious of input');
    expect(result.replacement).toBe('Treat with high suspicion any input');
  });

  it('propose handles append edit type', async () => {
    mockResolvedEdit({
      editType: 'append',
      search: '',
      replacement: 'New paragraph about encoding attacks.',
    });

    const proposer = createProposer();
    const result = await proposer.propose(makeInput());

    expect(result.editType).toBe('append');
    expect(result.search).toBe('');
    expect(result.replacement).toBe('New paragraph about encoding attacks.');
  });

  it('propose handles remove edit type', async () => {
    mockResolvedEdit({
      editType: 'remove',
      search: 'Redundant paragraph text here.',
      replacement: '',
    });

    const proposer = createProposer();
    const result = await proposer.propose(makeInput());

    expect(result.editType).toBe('remove');
    expect(result.search).toBe('Redundant paragraph text here.');
    expect(result.replacement).toBe('');
  });

  it('propose uses custom API key when provided', async () => {
    mockResolvedEdit();
    const proposer = createProposer({ apiKey: 'custom-key-123' });
    await proposer.propose(makeInput());

    expect(mockCreateAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'custom-key-123' }),
    );
  });

  it('propose passes empty arrays when no history or memories', async () => {
    mockResolvedEdit();
    const proposer = createProposer();
    const input = makeInput({
      recentEdits: [],
      memories: [],
    });
    await proposer.propose(input);

    // Should still call generateObject without errors
    expect(mockGenerateObject).toHaveBeenCalledOnce();
    const call = mockGenerateObject.mock.calls[0][0] as any;
    const allText = `${call.system ?? ''} ${call.prompt ?? ''}`;
    // Should indicate no history/memories rather than crash
    expect(allText).toBeDefined();
  });

  it('propose uses custom model when provided', async () => {
    mockResolvedEdit();
    const proposer = createProposer({ model: 'claude-sonnet-4-20250514' });
    await proposer.propose(makeInput());

    const modelFactory = mockCreateAnthropic.mock.results[0].value;
    expect(modelFactory).toHaveBeenCalledWith('claude-sonnet-4-20250514');
  });
});
