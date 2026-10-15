import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Skill packages may ship their own test runners and fixtures.
      // They are resources, not part of the Dots application's test suite.
      include: ['tests/**/*.{test,spec}.{ts,tsx,js,mjs,cjs}'],
    },
  }),
);
