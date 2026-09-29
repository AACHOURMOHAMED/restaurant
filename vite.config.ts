import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { restaurant } from './content/restaurant';
import type { WeeklyHours } from './shared/availability';
import { injectHead, renderHead } from './server/seo';

/** Fills the <head> with SEO tags at build time (the server refreshes them at runtime). */
function seoHead(): Plugin {
  return {
    name: 'bbpark-seo-head',
    transformIndexHtml(html) {
      const head = renderHead({
        lang: 'fr',
        publicUrl: process.env.PUBLIC_URL?.replace(/\/+$/, '') ?? null,
        hours: restaurant.defaultHours as WeeklyHours,
      });
      return injectHead(html, head);
    },
  };
}

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), seoHead()],
  resolve: {
    alias: {
      '@': r('./src'),
      '@shared': r('./shared'),
      '@content': r('./content'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
  preview: { port: 4173 },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
