import type {
  ArenaToolId,
  ChoicePoint,
  CrossroadsDecision,
  RunState,
} from './types';
import { ARENA_TOOL_CONFIGS } from './tool-packages';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class CrossroadsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrossroadsParseError';
  }
}

export class CrossroadsRefusalError extends Error {
  constructor(attempts: number, lastError: string) {
    super(`Agent refused crossroads after ${attempts} attempts. Last error: ${lastError}`);
    this.name = 'CrossroadsRefusalError';
  }
}

// ---------------------------------------------------------------------------
// Crossroads prompt construction
// ---------------------------------------------------------------------------

export type CrossroadsPromptInput = {
  currentTools: ArenaToolId[];
  offeredTools: ArenaToolId[];
  encounterHistory: string;
  memoryState: string;
  mustDrop: boolean;
  stateHash: string;
};

export function buildCrossroadsPrompt(input: CrossroadsPromptInput): string {
  const { currentTools, offeredTools, encounterHistory, memoryState, mustDrop, stateHash } = input;

  const currentDesc = currentTools
    .map(id => `  - ${id}: ${ARENA_TOOL_CONFIGS[id].derivedPromptFragment}`)
    .join('\n');

  const offeredDesc = offeredTools
    .map(id => `  - ${id}: ${ARENA_TOOL_CONFIGS[id].derivedPromptFragment}`)
    .join('\n');

  const sections = [
    `You are at a crossroads. Your identity hash is ${stateHash}.`,
    ``,
    `## Current tools`,
    currentDesc || '  (none)',
    ``,
    `## Offered tools (choose one)`,
    offeredDesc,
    ``,
    `## Encounter history`,
    encounterHistory || '(no encounters yet)',
    ``,
    `## Memory state`,
    memoryState || '(empty)',
  ];

  if (mustDrop) {
    sections.push(
      ``,
      `## Capacity full — you must sacrifice`,
      `Your tool slots are full. To acquire a new tool, you must drop one of your current flex tools.`,
      `Consider what you will lose and what you will gain. Your memory retains what you learned,`,
      `but the tool itself — and the approach it enables — will be gone.`,
    );
  }

  sections.push(
    ``,
    `## Instructions`,
    `Respond with structured XML:`,
    `<crossroads>`,
    `<self_assessment>How you see your current capabilities and gaps</self_assessment>`,
    `<acquisition_reasoning>Why you want the tool you're choosing</acquisition_reasoning>`,
    ...(mustDrop ? [`<sacrifice_reasoning>What you're giving up and why it's worth it</sacrifice_reasoning>`] : []),
    `<forward_model>How you expect your new composition to handle future challenges</forward_model>`,
    `<decision tool="TOOL_NAME"${mustDrop ? ' drop="TOOL_TO_DROP"' : ''} confidence="0.0-1.0"/>`,
    `</crossroads>`,
  );

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

export function parseCrossroadsResponse(
  xml: string,
  offeredTools: ArenaToolId[],
  currentFlexTools: ArenaToolId[],
): CrossroadsDecision {
  const extract = (tag: string): string | null => {
    const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 's'));
    return match ? match[1].trim() : null;
  };

  const selfAssessment = extract('self_assessment') ?? '';
  const acquisitionReasoning = extract('acquisition_reasoning') ?? '';
  const sacrificeReasoning = extract('sacrifice_reasoning') ?? null;
  const forwardModel = extract('forward_model') ?? '';

  // Parse decision element
  const decisionMatch = xml.match(/<decision\s+([^>]*)\/>/);
  if (!decisionMatch) throw new Error('No <decision/> element found in crossroads response.');

  const attrs = decisionMatch[1];
  const toolMatch = attrs.match(/tool="(\w+)"/);
  const dropMatch = attrs.match(/drop="(\w+)"/);
  const confMatch = attrs.match(/confidence="([^"]+)"/);

  const chosenTool = toolMatch?.[1] as ArenaToolId;
  const droppedTool = dropMatch ? (dropMatch[1] as ArenaToolId) : null;
  const rawConfidence = confMatch ? parseFloat(confMatch[1]) : 0.5;
  const confidence = Math.max(0, Math.min(1, isNaN(rawConfidence) ? 0.5 : rawConfidence));

  // Validate
  if (!offeredTools.includes(chosenTool)) {
    throw new CrossroadsParseError(
      `Chosen tool "${chosenTool}" not in offered tools: [${offeredTools.join(', ')}]`,
    );
  }
  if (droppedTool && !currentFlexTools.includes(droppedTool)) {
    throw new CrossroadsParseError(
      `Dropped tool "${droppedTool}" not in current flex tools: [${currentFlexTools.join(', ')}]`,
    );
  }

  return {
    selfAssessment,
    acquisitionReasoning,
    sacrificeReasoning,
    forwardModel,
    chosenTool,
    droppedTool,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Crossroads execution
// ---------------------------------------------------------------------------

export type ExecuteCrossroadsInput = {
  state: RunState;
  offeredTools: ArenaToolId[];
  mustDrop: boolean;
  /** Dependency-injected LLM call. */
  llmFn: (prompt: string) => Promise<string>;
  /** Compute state hash from sorted tool names. */
  computeStateHash: (tools: ArenaToolId[]) => string;
  /** Compute chain hash from parent hash + choice. */
  computeChainHash: (parentHash: string, choice: string) => string;
  /** Max parse/retry attempts before giving up (default: 3). */
  maxRetries?: number;
};

export async function executeCrossroads(input: ExecuteCrossroadsInput): Promise<ChoicePoint> {
  const { state, offeredTools, mustDrop, llmFn, computeStateHash, computeChainHash } = input;
  const maxRetries = input.maxRetries ?? 3;

  const encounterHistory = state.encounterOutputs
    .map(o => `${o.encounterId}: ${o.response.slice(0, 200)}`)
    .join('\n');

  const prompt = buildCrossroadsPrompt({
    currentTools: state.flexTools,
    offeredTools,
    encounterHistory,
    memoryState: state.memoryState,
    mustDrop,
    stateHash: state.stateHash,
  });

  let decision: CrossroadsDecision | null = null;
  let lastError = '';
  let lastResponse = '';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const actualPrompt = attempt === 0
      ? prompt
      : `${prompt}\n\nIMPORTANT: You MUST choose one of the offered tools: [${offeredTools.join(', ')}]. You cannot decline. Respond with valid XML.`;

    const response = await llmFn(actualPrompt);
    lastResponse = response;

    try {
      decision = parseCrossroadsResponse(response, offeredTools, state.flexTools);
      break;
    } catch (err) {
      if (err instanceof CrossroadsParseError) {
        lastError = err.message;
        continue;
      }
      throw err; // non-parse errors propagate immediately
    }
  }

  if (!decision) {
    throw new CrossroadsRefusalError(maxRetries, lastError);
  }

  // Compute new tool set after the choice
  const newFlexTools = [...state.flexTools];
  if (decision.droppedTool) {
    const dropIdx = newFlexTools.indexOf(decision.droppedTool);
    if (dropIdx >= 0) newFlexTools.splice(dropIdx, 1);
  }
  newFlexTools.push(decision.chosenTool);

  const newStateHash = computeStateHash(newFlexTools);
  const newChainHash = computeChainHash(state.stateHash, decision.chosenTool);

  return {
    encounterId: state.encounterOutputs.length > 0
      ? state.encounterOutputs[state.encounterOutputs.length - 1].encounterId
      : 'pre-e1',
    offeredTools,
    currentTools: state.flexTools,
    decision,
    memoryStateDump: state.memoryState,
    stateHash: newStateHash,
    chainHash: newChainHash,
    promptRendered: prompt,
    responseRaw: lastResponse,
  };
}
