import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@loopcommons/llm/arena/tournament': path.resolve(__dirname, '../llm/src/arena/tournament/index.ts'),
      '@loopcommons/llm/arena': path.resolve(__dirname, '../llm/src/arena/index.ts'),
      '@loopcommons/llm': path.resolve(__dirname, '../llm/src/index.ts'),
    },
  },
});
