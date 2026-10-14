import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { restaurant } from './content/restaurant';
import type { WeeklyHours } from './shared/availability';
import { injectHead, renderHead } from './server/seo';
import { HERO_SIZES } from './src/site/sections/heroImage';

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

/**
 * Starts downloading the first hero photo (the home page's main image) while the app's JavaScript is still
 * loading, instead of after the first render. The page is rendered in the browser, so without this the photo
 * is only requested once React has run (~1 s later on a slow phone connection).
 * The same index.html serves every route, so the preload is added by a tiny script, on the home page only.
 */
function preloadHeroPhoto(): Plugin {
  let fileRef: string | null = null;
  return {
    name: 'bbpark-preload-hero-photo',
    apply: 'build',
    buildStart() {
      let manifest: Record<string, { widths: number[]; base: string }> = {};
      try {
        manifest = JSON.parse(readFileSync(r('./src/generated/photos.json'), 'utf8'));
      } catch {
        return; // photos not generated yet: no preload
      }
      // The first hero photo that exists — the same choice as SLIDES in Hero.tsx.
      const names = restaurant.hero.slides.length > 0 ? restaurant.hero.slides : [restaurant.hero.photo];
      const entry = names.map((n) => (n ? manifest[n] : undefined)).find((e) => e !== undefined);
      if (!entry) return;
      const srcset = entry.widths.map((w) => `/photos/${entry.base}-${w}.avif ${w}w`).join(', ');
      // Same candidates and sizes as the <source type="image/avif"> of <Photo>, so the browser picks the same file.
      const source = `(function(){if(location.pathname!=='/')return;var l=document.createElement('link');l.rel='preload';l.as='image';l.type='image/avif';l.setAttribute('imagesrcset',${JSON.stringify(srcset)});l.setAttribute('imagesizes',${JSON.stringify(HERO_SIZES)});l.setAttribute('fetchpriority','high');document.head.appendChild(l)})();\n`;
      fileRef = this.emitFile({ type: 'asset', name: 'hero-preload.js', source });
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const file = fileRef ? Object.keys(ctx.bundle ?? {}).find((f) => /(^|\/)hero-preload-[\w-]+\.js$/.test(f)) : undefined;
        if (!file) return [];
        return [{ tag: 'script', attrs: { src: `/${file}`, async: true }, injectTo: 'head-prepend' as const }];
      },
    },
  };
}

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), seoHead(), preloadFonts(), preloadHeroPhoto()],
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
