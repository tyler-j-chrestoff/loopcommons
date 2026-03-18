import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {},
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@loopcommons/llm': path.resolve(__dirname, '../llm/src/index.ts'),
    },
  },
});
