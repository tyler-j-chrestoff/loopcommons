export type { Provider, ProviderCallParams, ProviderCallResult } from './base';
export { AnthropicProvider } from './anthropic';

import type { Provider } from './base';
import { AnthropicProvider } from './anthropic';

export function resolveProvider(modelName: string): Provider {
  if (modelName.startsWith('claude-')) {
    return new AnthropicProvider();
  }
  throw new Error(`No provider found for model: ${modelName}`);
}
