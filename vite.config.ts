import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { restaurant } from './content/restaurant';
import type { WeeklyHours } from './shared/availability';
import { injectHead, renderHead } from './server/seo';

/** PUBLIC_URL, or on Vercel the project's production address (same rule as server/config.ts). */
function publicUrl(): string | null {
  const url = process.env.PUBLIC_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  return url ? url.replace(/\/+$/, '') : null;
}

/**
 * Fills the <head> with SEO tags at build time. A long-running server refreshes them with the
 * opening hours saved in the dashboard; on Vercel, pages are static and keep these.
 */
function seoHead(): Plugin {
  return {
    name: 'bbpark-seo-head',
    transformIndexHtml(html) {
      const head = renderHead({
        lang: 'fr',
        publicUrl: publicUrl(),
        hours: restaurant.defaultHours as WeeklyHours,
      });
      return injectHead(html, head);
    },
  };
}

/** Preloads the fonts of the hero title and body text so the first screen renders sooner. */
function preloadFonts(): Plugin {
  return {
    name: 'bbpark-preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const fonts = Object.keys(ctx.bundle ?? {}).filter((f) =>
          /(cormorant-garamond-latin-wght-(normal|italic)|manrope-latin-wght-normal)-[\w-]+\.woff2$/.test(f),
        );
        return fonts.map((f) => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${f}`, crossorigin: '' },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), seoHead(), preloadFonts()],
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
