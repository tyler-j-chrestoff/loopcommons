import { z } from 'zod';
import { defineTool } from '../tool';
import type { ToolDefinition } from '../tool';
import type { Sandbox } from './types';

function createInspectTool(sandbox: Sandbox): ToolDefinition {
  return defineTool({
    name: 'inspect',
    description: 'Read system state: files, configs, logs, metrics. Read-only — never modifies state. Use target formats: "ls" (list all files), "services" (list services), file path, "service:<name>", "metrics:<name>", "logs:<name>".',
    parameters: z.object({
      target: z.string().describe('What to inspect: "ls" for file listing, "services" for service listing, file path, service:<name>, metrics:<name>, or logs:<name>'),
    }),
    execute: async ({ target }) => {
      // List all files
      if (target === 'ls' || target === 'files') {
        return Array.from(sandbox.files.keys()).sort().join('\n');
      }

      // List all services
      if (target === 'services') {
        return Array.from(sandbox.services.entries())
          .map(([name, svc]) => `${name}: ${svc.status}`)
          .join('\n');
      }

      // Service state
      if (target.startsWith('service:')) {
        const name = target.slice('service:'.length);
        const svc = sandbox.services.get(name);
        if (!svc) return `Service "${name}" not found.`;
        return JSON.stringify(svc, null, 2);
      }

      // Metrics
      if (target.startsWith('metrics:')) {
        const name = target.slice('metrics:'.length);
        const svc = sandbox.services.get(name);
        if (!svc) return `Service "${name}" not found.`;
        return JSON.stringify(svc.metrics, null, 2);
      }

      // Logs
      if (target.startsWith('logs:')) {
        const name = target.slice('logs:'.length);
        const svc = sandbox.services.get(name);
        if (!svc) return `Service "${name}" not found.`;
        return svc.logs.join('\n');
      }

      // File
      const content = sandbox.files.get(target);
      if (content === undefined) return `File "${target}" not found.`;
      return content;
    },
  });
}

function createActTool(sandbox: Sandbox): ToolDefinition {
  return defineTool({
    name: 'act',
    description: 'Execute commands against the system: "edit <path> <old> <new>", "restart <service>", "run <script-path>", "set-config <service> <key> <value>".',
    parameters: z.object({
      command: z.string().describe('Command to execute: edit, restart, run, set-config'),
    }),
    execute: async ({ command }) => {
      sandbox.commandLog.push(command);
      const parts = command.split(' ');
      const verb = parts[0];

      if (verb === 'edit' && parts.length >= 4) {
        const path = parts[1];
        const oldStr = parts[2];
        const newStr = parts[3];
        const content = sandbox.files.get(path);
        if (content === undefined) return `File "${path}" not found.`;
        if (!content.includes(oldStr)) return `String "${oldStr}" not found in ${path}.`;
        sandbox.files.set(path, content.replaceAll(oldStr, newStr));
        return `File ${path} edited: replaced "${oldStr}" with "${newStr}".`;
      }

      if (verb === 'restart' && parts.length >= 2) {
        const name = parts[1];
        const svc = sandbox.services.get(name);
        if (!svc) return `Service "${name}" not found.`;
        svc.logs.push('Service restarted');
        return `Service ${name} restarted.`;
      }

      if (verb === 'run' && parts.length >= 2) {
        const path = parts[1];
        const script = sandbox.files.get(path);
        if (script === undefined) return `Script "${path}" not found.`;
        return `Script ${path} executed successfully. Output: ${script.slice(0, 100)}`;
      }

      if (verb === 'set-config' && parts.length >= 4) {
        const name = parts[1];
        const key = parts[2];
        const value = parts.slice(3).join(' ');
        const svc = sandbox.services.get(name);
        if (!svc) return `Service "${name}" not found.`;
        svc.config[key] = value;
        return `Config ${name}.${key} set to ${value}.`;
      }

      return `Unknown command verb: "${verb}". Supported: edit, restart, run, set-config.`;
    },
  });
}

function createSearchTool(sandbox: Sandbox): ToolDefinition {
  return defineTool({
    name: 'search',
    description: 'Search the incident database and runbooks for relevant precedents. Returns matching records with outcomes.',
    parameters: z.object({
      query: z.string().describe('Search query — keywords, incident type, or system name'),
    }),
    execute: async ({ query }) => {
      const terms = query.toLowerCase().split(/\s+/);
      const matches = sandbox.incidentDb.filter(record => {
        const haystack = [record.title, record.description, record.resolution, ...record.tags]
          .join(' ')
          .toLowerCase();
        return terms.some(term => haystack.includes(term));
      });

      if (matches.length === 0) return 'No matching incidents found.';

      return matches
        .map(r => `[${r.id}] ${r.title}\n  ${r.description}\n  Resolution: ${r.resolution}\n  Tags: ${r.tags.join(', ')}`)
        .join('\n\n');
    },
  });
}

function createModelTool(sandbox: Sandbox): ToolDefinition {
  return defineTool({
    name: 'model',
    description: 'Map dependency graphs and trace causal chains. Returns structural descriptions of system relationships.',
    parameters: z.object({
      system: z.string().describe('Service name to map dependencies for, or "all" for full graph'),
    }),
    execute: async ({ system }) => {
      if (system === 'all') {
        const entries = Object.entries(sandbox.dependencyGraph);
        if (entries.length === 0) return 'No dependencies found in the system.';
        return 'Dependency graph:\n' +
          entries.map(([svc, deps]) => `  ${svc} → [${deps.join(', ')}]`).join('\n');
      }

      const deps = sandbox.dependencyGraph[system];
      if (!deps || deps.length === 0) return `No dependencies found for "${system}".`;
      return `${system} depends on: [${deps.join(', ')}]\n\nTransitive dependencies:\n` +
        traceDeps(sandbox.dependencyGraph, system, 0);
    },
  });
}

function traceDeps(graph: Record<string, string[]>, node: string, depth: number): string {
  const deps = graph[node];
  if (!deps || deps.length === 0) return '';
  const indent = '  '.repeat(depth + 1);
  return deps
    .map(dep => {
      const sub = traceDeps(graph, dep, depth + 1);
      return `${indent}${node} → ${dep}${sub ? '\n' + sub : ''}`;
    })
    .join('\n');
}

/**
 * Create the 4 arena sandbox tools backed by the given sandbox.
 * Returns [inspect, act, search, model] as ToolDefinition[].
 */
export function createSandboxTools(sandbox: Sandbox): ToolDefinition[] {
  return [
    createInspectTool(sandbox),
    createActTool(sandbox),
    createSearchTool(sandbox),
    createModelTool(sandbox),
  ];
}
