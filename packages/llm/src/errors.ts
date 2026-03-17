export type LLMErrorCode = 'PROVIDER_ERROR' | 'TOOL_EXECUTION_ERROR' | 'MAX_ROUNDS_EXCEEDED';

export class LLMError extends Error {
  code: LLMErrorCode;

  constructor(code: LLMErrorCode, message: string) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
  }
}
