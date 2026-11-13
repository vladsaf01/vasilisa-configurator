import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Конструктор собирается как обычное SPA. Позже этот же корень
// подключается к Astro как остров (см. README, раздел «Интеграция»).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5174, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5174, strictPort: true, host: '127.0.0.1' },
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 1200,
  },
});
