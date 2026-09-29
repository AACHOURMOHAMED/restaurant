import path from 'node:path';
import { z } from 'zod';

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
  DATABASE_PATH: z.string().optional(),
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

/** A mistake in the environment variables: reported as one clear message, without a stack trace. */
export class ConfigError extends Error {}

export type AppConfig = {
  env: 'development' | 'production' | 'test';
  host: string;
  port: number;
  dataDir: string;
  databasePath: string;
  uploadsDir: string;
  staticDir: string;
  publicUrl: string | null;
  trustProxy: boolean | number | string;
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

  let trustProxy: boolean | number | string = false;
  if (e.TRUST_PROXY) {
    // `true` would trust every X-Forwarded-For entry, which visitors can write themselves:
    // anyone could then pose as a new IP address on each request and bypass the rate limits.
    if (e.TRUST_PROXY === 'true') {
      throw new ConfigError(
        'Invalid environment configuration:\n  TRUST_PROXY: set the NUMBER of proxies in front of the app (usually 1), or their IP addresses — not "true".',
      );
    }
    trustProxy = /^\d+$/.test(e.TRUST_PROXY) ? Number(e.TRUST_PROXY) : e.TRUST_PROXY;
  }

  const fakeNow = e.NODE_ENV !== 'production' && e.FAKE_NOW ? new Date(e.FAKE_NOW) : null;
  if (fakeNow && Number.isNaN(fakeNow.getTime())) throw new Error('FAKE_NOW must be an ISO date');

  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    dataDir,
    databasePath: path.resolve(e.DATABASE_PATH ?? path.join(dataDir, 'restaurant.db')),
    uploadsDir: path.join(dataDir, 'uploads'),
    staticDir: path.resolve(e.STATIC_DIR ?? 'dist/client'),
    publicUrl: e.PUBLIC_URL ?? null,
    trustProxy,
    // `auto`: HTTPS-only cookies (plus HSTS) in production, or whenever the public address is https.
    cookieSecure:
      e.COOKIE_SECURE === 'auto'
        ? e.NODE_ENV === 'production' || (e.PUBLIC_URL?.startsWith('https://') ?? false)
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
