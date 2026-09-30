/**
 * Security headers of the website's pages. The server sends them itself (app.ts); on Vercel the
 * pages are static files, so vercel.json carries the same values (a test keeps the two in sync).
 */
import { restaurant } from '../content/restaurant.js';

/** Public Vercel Blob stores are served from <store id>.public.blob.vercel-storage.com. */
export const BLOB_ORIGINS = 'https://*.public.blob.vercel-storage.com';

export function cspDirectives(opts: { blobPhotos: boolean; https: boolean }): Record<string, string[]> {
  const mapFrame = restaurant.address.mapEmbedUrl ? new URL(restaurant.address.mapEmbedUrl).origin : null;
  return {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'script-src': ["'self'"],
    'script-src-attr': ["'none'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    // Dish photos come from the Vercel Blob CDN when a Blob store is connected.
    'img-src': ["'self'", 'data:', 'blob:', ...(opts.blobPhotos ? [BLOB_ORIGINS] : [])],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'"],
    'media-src': ["'self'", 'blob:'],
    'worker-src': ["'self'", 'blob:'],
    'frame-src': mapFrame ? [mapFrame] : ["'none'"],
    'object-src': ["'none'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'self'"],
    ...(opts.https ? { 'upgrade-insecure-requests': [] } : {}),
  };
}

export const cspHeader = (opts: { blobPhotos: boolean; https: boolean }) =>
  Object.entries(cspDirectives(opts))
    .map(([name, values]) => [name, ...values].join(' '))
    .join('; ');

/** The in-site QR scanner needs the camera; nothing else does. */
export const PERMISSIONS_POLICY = 'camera=(self), microphone=(), geolocation=(), payment=()';
