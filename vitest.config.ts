import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/* O núcleo é TypeScript puro, sem DOM: os testes rodam em ambiente node,
   sem jsdom e sem nenhum mock de canvas. */
export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
