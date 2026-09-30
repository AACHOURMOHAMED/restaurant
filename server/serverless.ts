/**
 * Vercel entry (see api/index.ts): one Fastify app per function instance, created on the first
 * request and reused by the following ones. No timers, no open connections between requests:
 * scheduled housekeeping runs through Vercel Cron Jobs (vercel.json → /api/cron/daily).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { waitUntil } from '@vercel/functions';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { createContext, ensureAdmin } from './bootstrap.js';
import { ConfigError, loadConfig } from './config.js';
import { Notifier } from './context.js';

let starting: Promise<FastifyInstance> | null = null;

function getApp(): Promise<FastifyInstance> {
  starting ??= (async () => {
    const config = loadConfig();
    const ctx = await createContext(config);
    const app = await buildApp(ctx);
    ctx.notifier = new Notifier(config.webhookUrl, app.log, waitUntil);
    // A mistake in ADMIN_* must not take the whole site down: log it (visible in the Vercel logs).
    await ensureAdmin(ctx, app.log).catch((err: unknown) =>
      app.log.error({ err }, err instanceof ConfigError ? err.message : 'could not create the first administrator'),
    );
    await app.ready();
    return app;
  })().catch((err: unknown) => {
    starting = null; // try again on the next request
    throw err;
  });
  return starting;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let app: FastifyInstance;
  try {
    app = await getApp();
  } catch (err) {
    console.error(err instanceof ConfigError ? err.message : err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'The server is not ready. Please try again in a moment.' } }));
    return;
  }
  app.server.emit('request', req, res);
}
