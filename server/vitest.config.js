import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false, // integration tests share one MongoDB database
    testTimeout: 15000,
    hookTimeout: 20000,
  },
});
