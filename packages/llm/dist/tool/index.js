import { tool as aiTool } from 'ai';
/** Type-safe tool definition helper */
export function defineTool(config) {
    return config;
}
/** Create a tool registry from an array of tool definitions */
export function createToolRegistry(tools) {
    const map = new Map(tools.map(t => [t.name, t]));
    return {
        get: (name) => map.get(name),
        has: (name) => map.has(name),
        list: () => [...map.keys()],
        toProviderFormat: () => {
            const result = {};
            for (const t of tools) {
                result[t.name] = aiTool({
                    description: t.description,
                    inputSchema: t.parameters, // v6 uses inputSchema, NOT parameters
                    execute: t.execute,
                });
            }
            return result;
        },
    };
}
