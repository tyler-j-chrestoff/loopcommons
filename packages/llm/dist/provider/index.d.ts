export type { Provider, ProviderCallParams, ProviderCallResult } from './base';
export { AnthropicProvider } from './anthropic';
import type { Provider } from './base';
export declare function resolveProvider(modelName: string): Provider;
