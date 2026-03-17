export * from './events';
import type { Trace } from './events';
export declare function createTrace(model: string, provider: string, opts: {
    system?: string;
    maxRounds: number;
}): Trace;
