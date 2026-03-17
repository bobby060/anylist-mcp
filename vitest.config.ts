import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30000, // 30 seconds for integration tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        'vitest.config.ts',
        'src/types/',
        'prompt_logs/',
        'plans/',
        '.taskmaster/',
        '.roo/',
        '.cursor/',
        'coverage/',
      ],
      thresholds: {
        global: {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
      },
      include: [
        'src/**/*.ts',
      ],
    },
  },
}); 