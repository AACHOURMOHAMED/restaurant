import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@content': fileURLToPath(new URL('./content', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
  },
});
