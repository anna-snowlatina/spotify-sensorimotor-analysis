import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom (rather than plain node) since some modules touch localStorage.
    environment: 'jsdom',
  },
});
