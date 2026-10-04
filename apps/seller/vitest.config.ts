import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Plain TypeScript logic, plus the auth client with React Native and Expo modules mocked
// (decision #40): screens are checked by hand on the Redmi.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.ts'],
    // Processed by Vitest so the React Native / Expo mocks apply inside it.
    server: { deps: { inline: ['@better-auth/expo'] } },
  },
});
