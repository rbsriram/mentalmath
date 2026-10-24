import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { serviceWorkerPlugin } from './sw-plugin.js';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [svelte(), serviceWorkerPlugin()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
