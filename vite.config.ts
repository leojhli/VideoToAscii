import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { rollupOptions: { input: ['index.html', 'examples/portfolio.html'] } },
  plugins: [react()],
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
});
