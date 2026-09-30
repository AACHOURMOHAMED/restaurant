import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '../shared/api-types.js';
import { issuesToFields } from '../shared/schemas.js';
import type { AppContext } from './context.js';
import { AppError } from './errors.js';
import { cspDirectives, PERMISSIONS_POLICY } from './headers.js';
import { getWeeklyHours } from './repos/settings.js';
import { cronRoutes } from './routes/cron.js';
import { publicRoutes } from './routes/public.js';
import { staffRoutes } from './routes/staff.js';
import { injectHead, renderHead } from './seo.js';

/** Hide capability tokens (guests' status links, as API calls or as pages) from access logs. */
export function redactUrl(url: string): string {
  return url.replace(/(\/(?:api\/public\/(?:reservations|orders)|reservation|order)\/)[A-Za-z0-9_-]{20,}/, '$1[redacted]');
}

function errorBody(code: string, message: string, extra: Partial<ApiErrorBody['error']> = {}): ApiErrorBody {
  return { error: { code, message, ...extra } };
}

export async function buildApp(ctx: AppContext, opts: { logger?: FastifyServerOptions['logger'] } = {}) {
  const { config } = ctx;
  const app = Fastify({
    logger: opts.logger ?? {
      level: config.logLevel,
      serializers: {
        req: (req) => ({ method: req.method, url: redactUrl(req.url), remoteAddress: req.ip }),
      },
    },
    trustProxy: config.trustProxy,
    bodyLimit: 256 * 1024,
  });

  app.decorateRequest('staff', null);

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: cspDirectives({ blobPhotos: !!config.blobToken, https: config.cookieSecure }),
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.cookieSecure ? undefined : false,
  });
  app.addHook('onSend', async (_req, reply) => {
    reply.header('Permissions-Policy', PERMISSIONS_POLICY);
  });

  // Dynamic responses (API JSON, pages) are compressed on the fly with a fast setting;
  // built assets are served pre-compressed (see scripts/precompress.mjs).
  await app.register(compress, {
    global: true,
    threshold: 1024,
    encodings: ['br', 'gzip'],
    brotliOptions: { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } },
  });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 12 * 1024 * 1024, files: 1, fields: 5 } });
  if (config.rateLimit) {
    await app.register(rateLimit, {
      global: false,
      errorResponseBuilder: (_req, context) => ({
        statusCode: 429,
        ...errorBody('RATE_LIMITED', `Too many requests. Please try again in ${Math.ceil(context.ttl / 1000)} s.`),
      }),
    });
  }

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply
        .status(err.statusCode)
        .send(errorBody(err.code, err.message, { fields: err.extra.fields, details: err.extra.details }));
    }
    if (err instanceof ZodError) {
      return reply
        .status(400)
        .send(errorBody('VALIDATION', 'Some fields are invalid', { fields: issuesToFields(err.issues) }));
    }
    const e = err as { statusCode?: number; code?: string; message?: string };
    // PostgreSQL refusing a value (out-of-range number, malformed input): the request was wrong, not the server.
    // (22003 number out of range, 22P02 malformed number, 22021 NUL character in text.)
    if (e.code === '22003' || e.code === '22P02' || e.code === '22021') {
      return reply.status(400).send(errorBody('VALIDATION', 'Some fields are invalid'));
    }
    if (e.statusCode === 429) return reply.status(429).send(errorBody('RATE_LIMITED', 'Too many requests'));
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.status(e.statusCode).send(errorBody(e.code ?? 'BAD_REQUEST', e.message ?? 'Bad request'));
    }
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send(errorBody('INTERNAL', 'Something went wrong. Please try again.'));
  });

  await publicRoutes(app, ctx);
  await staffRoutes(app, ctx);
  await cronRoutes(app, ctx);

  // Uploaded dish photos kept on disk: file names are unique, so they can be cached forever. Also served
  // after a switch to Blob storage, for the photos uploaded before it.
  const diskPhotos = ctx.media?.defaultBase === '/uploads';
  if (!config.serverless && (diskPhotos || fs.existsSync(config.uploadsDir))) {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    await app.register(fastifyStatic, {
      root: config.uploadsDir,
      prefix: '/uploads/',
      decorateReply: false,
      index: false,
      setHeaders: (reply) => void reply.header('Cache-Control', 'public, max-age=31536000, immutable'),
    });
  }

  // Built website (npm run build). In development Vite serves the front end instead; on Vercel, its CDN does.
  const indexFile = path.join(config.staticDir, 'index.html');
  const hasClient = !config.serverless && fs.existsSync(indexFile);
  if (hasClient) {
    await app.register(fastifyStatic, {
      root: config.staticDir,
      prefix: '/',
      index: false,
      // Register the built files as routes; every other path falls through to the page handler below.
      wildcard: false,
      preCompressed: true,
      setHeaders: (reply, file) => {
        const immutable = file.includes(`${path.sep}assets${path.sep}`) || file.includes(`${path.sep}photos${path.sep}`);
        reply.header('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      },
    });
  }
  const template = hasClient ? fs.readFileSync(indexFile, 'utf8') : null;
  let cached: { key: string; html: string } | null = null;
  const renderIndex = async () => {
    const hours = await getWeeklyHours(ctx.db);
    const key = JSON.stringify(hours);
    if (!cached || cached.key !== key) {
      const head = renderHead({ lang: 'fr', publicUrl: config.publicUrl, hours, shareImage: null });
      cached = { key, html: injectHead(template!, head) };
    }
    return cached.html;
  };

  // Website pages: a catch-all route (static files and API routes are more specific and win).
  // Being a real route, its HTML is compressed like any other response.
  if (template) {
    app.get('/*', async (req, reply) => {
      const pathname = req.url.split('?')[0]!;
      const isPage = !pathname.startsWith('/api/') && !pathname.startsWith('/uploads/') && !/\.[a-z0-9]{2,5}$/i.test(pathname);
      if (!isPage) return reply.status(404).send(errorBody('NOT_FOUND', 'Not found'));
      return reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache').send(await renderIndex());
    });
  }

  app.setNotFoundHandler((_req, reply) => reply.status(404).send(errorBody('NOT_FOUND', 'Not found')));

  return app;
}
