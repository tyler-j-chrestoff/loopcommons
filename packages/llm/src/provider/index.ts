export type { Provider, ProviderCallParams, ProviderCallResult } from './base';
export { AnthropicProvider } from './anthropic';

import type { Provider } from './base';
import { AnthropicProvider } from './anthropic';
import { LLMError } from '../errors';

export function resolveProvider(modelName: string): Provider {
  if (modelName.startsWith('claude-')) {
    return new AnthropicProvider();
  }
  throw new LLMError('PROVIDER_ERROR', 'The requested model is not available.');
}
