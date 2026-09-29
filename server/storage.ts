/**
 * Where uploaded files (dish photos) live:
 *  - on Vercel (or whenever BLOB_READ_WRITE_TOKEN is set): Vercel Blob, served from its CDN;
 *  - otherwise: DATA_DIR/uploads on disk, served by this server under /uploads.
 * Files are public and named with random keys, so their URLs can be cached forever.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { AppConfig } from './config.js';

export interface MediaStore {
  /** Stores a file; returns the base URL under which `pathname` is now served. */
  put(pathname: string, body: Buffer, contentType: string): Promise<string>;
  remove(pathnames: string[]): Promise<void>;
  /** Base URL used before anything was uploaded (disk: '/uploads'; Blob: unknown until the first upload). */
  readonly defaultBase: string | null;
}

const safe = (pathname: string) => {
  if (!/^[a-z0-9][a-z0-9/_-]*\.[a-z0-9]+$/i.test(pathname) || pathname.includes('..')) throw new Error(`Unsafe path: ${pathname}`);
  return pathname;
};

export function diskStore(dir: string): MediaStore {
  return {
    defaultBase: '/uploads',
    async put(pathname, body) {
      const file = path.join(dir, safe(pathname));
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, body);
      return '/uploads';
    },
    async remove(pathnames) {
      await Promise.all(pathnames.map((p) => fs.rm(path.join(dir, safe(p)), { force: true })));
    },
  };
}

export function blobStore(token: string): MediaStore {
  return {
    defaultBase: null,
    async put(pathname, body, contentType) {
      const { put } = await import('@vercel/blob');
      const blob = await put(safe(pathname), body, {
        access: 'public',
        token,
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60 * 60 * 24 * 365,
      });
      return new URL(blob.url).origin;
    },
    async remove(pathnames) {
      if (pathnames.length === 0) return;
      const { del } = await import('@vercel/blob');
      await del(pathnames.map(safe), { token });
    },
  };
}

/** Blob when configured; the disk otherwise — except on Vercel, where local files don't last (null: uploads disabled). */
export function mediaStoreFor(config: Pick<AppConfig, 'blobToken' | 'serverless' | 'uploadsDir'>): MediaStore | null {
  if (config.blobToken) return blobStore(config.blobToken);
  return config.serverless ? null : diskStore(config.uploadsDir);
}
