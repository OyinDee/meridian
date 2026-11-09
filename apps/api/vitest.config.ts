import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// NestJS relies on `emitDecoratorMetadata` for dependency injection, which esbuild
// (vitest's default transform) does not emit. SWC does, so tests can boot real Nest
// modules instead of hand-wiring every provider.
const nestSwc = () => swc.vite({ module: { type: 'es6' } });

export default defineConfig({
  test: {
    globals: false,
    projects: [
      {
        plugins: [nestSwc()],
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.spec.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        plugins: [nestSwc()],
        test: {
          name: 'integration',
          environment: 'node',
          include: ['test/integration/**/*.spec.ts'],
          // Money tests share one database: run them serially so balance
          // assertions never race each other.
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
      {
        plugins: [nestSwc()],
        test: {
          name: 'e2e',
          environment: 'node',
          include: ['test/e2e/**/*.spec.ts'],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.module.ts', 'src/main.ts', 'src/scripts/**', 'src/**/*.spec.ts'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
});
