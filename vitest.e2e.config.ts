import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 120000, // 2 minutes per test
    hookTimeout: 30000,
    teardownTimeout: 10000,
    fileParallelism: false,
    sequence: {
      shuffle: false
    }
  }
});
