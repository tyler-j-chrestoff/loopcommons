import { agent, defineTool } from '../src';
import { z } from 'zod';
import type { TraceEvent } from '../src/trace';

// Check for API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is required');
  process.exit(1);
}

// Define a simple calculator tool
const calculate = defineTool({
  name: 'calculate',
  description: 'Evaluate a basic math expression and return the result',
  parameters: z.object({
    expression: z.string().describe('A math expression like "42 * 17"'),
  }),
  execute: async ({ expression }) => {
    // Simple safe eval for basic math
    const sanitized = expression.replace(/[^0-9+\-*/().% ]/g, '');
    if (sanitized !== expression) {
      return `Error: expression contains invalid characters`;
    }
    try {
      const result = new Function(`return (${sanitized})`)();
      return String(result);
    } catch {
      return `Error: could not evaluate "${expression}"`;
    }
  },
});

// Trace collector that logs events
const collector = {
  onEvent: (event: TraceEvent) => {
    const ts = new Date(event.timestamp).toISOString();
    console.log(`[${ts}] ${event.type}`, event.type === 'tool:complete' ? `→ ${event.execution.output}` : '');
  },
};

async function main() {
  console.log('Running integration test...\n');

  const result = await agent({
    model: 'claude-haiku-4-5',
    system: 'You are a helpful calculator. Use the calculate tool to answer math questions.',
    messages: [{ role: 'user', content: 'What is 42 * 17?' }],
    tools: [calculate],
    trace: collector,
  });

  console.log('\n--- Result ---');
  console.log('Message:', result.message);
  console.log('Rounds:', result.rounds);
  console.log('Cost: $' + result.cost.toFixed(6));
  console.log('Usage:', result.usage);
  console.log('\n--- Trace (JSON) ---');
  console.log(JSON.stringify(result.trace, null, 2));
}

main().catch(err => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
