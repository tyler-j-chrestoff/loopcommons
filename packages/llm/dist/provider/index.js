export { AnthropicProvider } from './anthropic';
import { AnthropicProvider } from './anthropic';
export function resolveProvider(modelName) {
    if (modelName.startsWith('claude-')) {
        return new AnthropicProvider();
    }
    throw new Error(`No provider found for model: ${modelName}`);
}
