import net from 'node:net';
import path from 'node:path';
import { z } from 'zod';
import type { DatabaseTarget } from './db.js';

const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'])
    .optional()
    .transform((v) => (v === undefined ? fallback : ['true', '1', 'yes', 'on'].includes(v)));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATA_DIR: z.string().default('./data'),
  /** PostgreSQL connection string (Neon on Vercel sets it). Without it, an embedded Postgres keeps its data in DATA_DIR/pgdata. */
  DATABASE_URL: z.string().optional(),
  POSTGRES_URL: z.string().optional(),
  /** Vercel Blob store for dish photos (set by Vercel when a Blob store is connected). Without it, photos go to DATA_DIR/uploads. */
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  /** Set by Vercel: the app then runs as a serverless function. */
  VERCEL: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  /** Vercel Cron Jobs send it; protects /api/cron/*. */
  CRON_SECRET: z.string().optional(),
  /** Public address of the website, e.g. https://www.bandbpark.ma — used for QR codes and SEO. */
  PUBLIC_URL: z
    .url()
    .optional()
    .transform((v) => (v ? v.replace(/\/+$/, '') : undefined)),
  /** Set when running behind a reverse proxy/load balancer ("true", a hop count, or a list of IPs). */
  TRUST_PROXY: z.string().optional(),
  COOKIE_SECURE: z.enum(['auto', 'true', 'false']).default('auto'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(24 * 7),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_NAME: z.string().default('Administrateur'),
  NOTIFY_WEBHOOK_URL: z.url().optional(),
  RATE_LIMIT: bool(true),
  /** Personal data of reservations older than this many days is erased automatically (0 = never). */
  RETENTION_DAYS: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Testing only: pretend the current time is this ISO instant. Ignored in production. */
  FAKE_NOW: z.string().optional(),
  STATIC_DIR: z.string().optional(),
});

/** Fastify's trustProxy: off, a list of proxy addresses, or a function of (address, hop). */
export type TrustProxy = boolean | string | ((address: string, hop: number) => boolean);

// Loopback and private networks: where a reverse proxy on the same machine (or a Docker host) connects from.
const localNetworks = new net.BlockList();
localNetworks.addSubnet('127.0.0.0', 8, 'ipv4');
localNetworks.addSubnet('10.0.0.0', 8, 'ipv4');
localNetworks.addSubnet('172.16.0.0', 12, 'ipv4');
localNetworks.addSubnet('192.168.0.0', 16, 'ipv4');
localNetworks.addSubnet('169.254.0.0', 16, 'ipv4');
localNetworks.addAddress('::1', 'ipv6');
localNetworks.addSubnet('fc00::', 7, 'ipv6');
localNetworks.addSubnet('fe80::', 10, 'ipv6');

export function isLocalAddress(address: string): boolean {
  const v4 = address.startsWith('::ffff:') && net.isIPv4(address.slice(7)) ? address.slice(7) : address;
  const type = net.isIPv4(v4) ? 'ipv4' : net.isIPv6(v4) ? 'ipv6' : null;
  return type !== null && localNetworks.check(v4, type);
}

/**
 * TRUST_PROXY=<n>: n proxies in front of the app, the nearest one connecting from this machine or a
 * private network (Caddy/nginx on the host, Docker). Fastify ignores a bare hop count — it can't tell
 * whether a request really came through the proxy — so the nearest hop's address is checked here:
 * a visitor connecting directly can't choose their own address with X-Forwarded-For.
 */
export function trustHops(count: number): (address: string, hop: number) => boolean {
  return (address, hop) => hop < count && (hop > 0 || isLocalAddress(address));
}

/** A mistake in the environment variables: reported as one clear message, without a stack trace. */
export class ConfigError extends Error {}

export type AppConfig = {
  env: 'development' | 'production' | 'test';
  host: string;
  port: number;
  dataDir: string;
  database: DatabaseTarget;
  /** Vercel Blob token for dish photos; null → photos are stored in uploadsDir. */
  blobToken: string | null;
  uploadsDir: string;
  /** Running as a serverless function (Vercel): no long-lived connections, background timers or local files. */
  serverless: boolean;
  cronSecret: string | null;
  staticDir: string;
  publicUrl: string | null;
  trustProxy: TrustProxy;
  cookieSecure: boolean;
  sessionTtlMs: number;
  admin: { email: string; password: string; name: string } | null;
  webhookUrl: string | null;
  rateLimit: boolean;
  retentionDays: number;
  logLevel: string;
  fakeNow: Date | null;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // `KEY=` lines in a .env file mean "not set", not "empty string".
  const parsed = envSchema.safeParse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new ConfigError(`Invalid environment configuration:\n${details}`);
  }
  const e = parsed.data;
  const dataDir = path.resolve(e.DATA_DIR);
  const serverless = !!e.VERCEL;
  const databaseUrl = e.DATABASE_URL ?? e.POSTGRES_URL;
  if (serverless && !databaseUrl) {
    // An embedded database would live in a throwaway folder of one function instance: bookings would vanish.
    throw new ConfigError(
      'Invalid environment configuration:\n  DATABASE_URL: required on Vercel. Add a Postgres database (Neon) to the project from the Vercel Marketplace (Storage tab).',
    );
  }
  const productionUrl = e.VERCEL_PROJECT_PRODUCTION_URL ? `https://${e.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/+$/, '')}` : undefined;
  const publicUrl = e.PUBLIC_URL ?? productionUrl;

  // Which X-Forwarded-For entries to believe, i.e. how the server learns each visitor's address
  // (used by the rate limits and the sign-in/booking throttles).
  // On Vercel the function is only reachable through Vercel's proxy, which replaces X-Forwarded-For
  // with the visitor's address: trust exactly that one hop.
  let trustProxy: TrustProxy = serverless ? (_address, hop) => hop === 0 : false;
  if (e.TRUST_PROXY) {
    // `true` would trust every X-Forwarded-For entry, which visitors can write themselves:
    // anyone could then pose as a new IP address on each request and bypass the rate limits.
    if (e.TRUST_PROXY === 'true') {
      throw new ConfigError(
        'Invalid environment configuration:\n  TRUST_PROXY: set the NUMBER of proxies in front of the app (usually 1), or their IP addresses — not "true".',
      );
    }
    trustProxy = /^\d+$/.test(e.TRUST_PROXY) ? trustHops(Number(e.TRUST_PROXY)) : e.TRUST_PROXY;
  }

  const fakeNow = e.NODE_ENV !== 'production' && e.FAKE_NOW ? new Date(e.FAKE_NOW) : null;
  if (fakeNow && Number.isNaN(fakeNow.getTime())) throw new Error('FAKE_NOW must be an ISO date');

  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    dataDir,
    database: databaseUrl ? { url: databaseUrl } : { dir: path.join(dataDir, 'pgdata') },
    blobToken: e.BLOB_READ_WRITE_TOKEN ?? null,
    uploadsDir: path.join(dataDir, 'uploads'),
    serverless,
    cronSecret: e.CRON_SECRET ?? null,
    staticDir: path.resolve(e.STATIC_DIR ?? 'dist/client'),
    publicUrl: publicUrl ?? null,
    trustProxy,
    // `auto`: HTTPS-only cookies (plus HSTS) in production, or whenever the public address is https.
    cookieSecure:
      e.COOKIE_SECURE === 'auto'
        ? e.NODE_ENV === 'production' || (publicUrl?.startsWith('https://') ?? false)
        : e.COOKIE_SECURE === 'true',
    sessionTtlMs: e.SESSION_TTL_HOURS * 3_600_000,
    admin:
      e.ADMIN_EMAIL && e.ADMIN_PASSWORD
        ? { email: e.ADMIN_EMAIL.trim().toLowerCase(), password: e.ADMIN_PASSWORD, name: e.ADMIN_NAME }
        : null,
    webhookUrl: e.NOTIFY_WEBHOOK_URL ?? null,
    rateLimit: e.RATE_LIMIT,
    retentionDays: e.RETENTION_DAYS,
    logLevel: e.LOG_LEVEL,
    fakeNow,
  };
}
