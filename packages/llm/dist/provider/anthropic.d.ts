import type { Provider, ProviderCallParams, ProviderCallResult, StreamEvent } from './base';
export declare class AnthropicProvider implements Provider {
    name: string;
    private client;
    constructor(opts?: {
        apiKey?: string;
    });
    /** Prevent API key leakage via JSON.stringify or structured clone */
    toJSON(): {
        name: string;
    };
    /** Prevent API key leakage via string coercion or console.log */
    toString(): string;
    call(params: ProviderCallParams): Promise<ProviderCallResult>;
    streamCall(params: ProviderCallParams): AsyncIterable<StreamEvent>;
}
