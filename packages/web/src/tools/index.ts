import type { ToolDefinition } from '@loopcommons/llm';
import { resumeTool } from './resume';
import { projectTool } from './project';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- variance mismatch between specific ZodObject and base ZodType
export const tools: ToolDefinition<any>[] = [resumeTool, projectTool];
