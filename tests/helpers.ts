import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../server/app';
import { loadConfig, type AppConfig } from '../server/config';
import { EventHub, Notifier, type AppContext } from '../server/context';
import { openDatabase, type Db } from '../server/db';
import { createUser } from '../server/services/auth';
import { diskStore, type MediaStore } from '../server/storage';

export const ORIGIN = 'http://localhost';
export const ADMIN = { email: 'admin@test.local', password: 'correct-horse-battery', name: 'Admin' };
export const STAFF = { email: 'staff@test.local', password: 'staff-password-123', name: 'Serveur' };

let keyCounter = 0;
export const newKey = () => `test-key-${Date.now()}-${++keyCounter}-abcdef`;

export type TestApp = {
  app: FastifyInstance;
  ctx: AppContext;
  setNow(iso: string): void;
  /** Signs in and returns a function that performs authenticated requests. */
  login(user?: { email: string; password: string }): Promise<StaffClient>;
  close(): Promise<void>;
};

export type StaffClient = (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
) => Promise<LightMyRequestResponse>;

/** Monday 5 October 2026, 11:00 in Kénitra (UTC+1). */
export const DEFAULT_NOW = '2026-10-05T10:00:00Z';

// ─── Test database ───────────────────────────────────────────────────────────
// One database per test file (starting Postgres takes a few seconds), emptied before every test.
// By default an in-memory PGlite; set TEST_DATABASE_URL to run the suite on a real PostgreSQL
// server (each vitest worker then gets its own database, so parallel files don't collide).

let shared: Promise<Db> | null = null;

async function openTestDatabase(): Promise<Db> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return openDatabase('memory');
  const target = new URL(url);
  const name = `${target.pathname.slice(1)}_w${process.env.VITEST_POOL_ID ?? '0'}`;
  const admin = await openDatabase({ url });
  await admin.exec(`CREATE DATABASE "${name}"`).catch((err: { code?: string }) => {
    if (err.code !== '42P04') throw err; // already exists
  });
  await admin.close();
  target.pathname = `/${name}`;
  // Start from an empty schema: an earlier run may have left an older one.
  const reset = await openDatabase({ url: target.toString() }).catch(() => null);
  if (reset) {
    await reset.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await reset.close();
  }
  return openDatabase({ url: target.toString() });
}

export async function testDatabase(): Promise<Db> {
  shared ??= openTestDatabase();
  const db = await shared;
  const tables = await db.many<{ name: string }>(
    `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
  );
  await db.exec(`TRUNCATE ${tables.map((t) => `"${t.name}"`).join(', ')} RESTART IDENTITY CASCADE`);
  return db;
}

export async function closeTestDatabase(): Promise<void> {
  const db = await shared;
  shared = null;
  await db?.close();
}

export async function makeApp(
  opts: { now?: string; rateLimit?: boolean; staticDir?: string; config?: Partial<AppConfig>; media?: MediaStore | null } = {},
): Promise<TestApp> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbpark-test-'));
  const base = loadConfig({ NODE_ENV: 'test', DATA_DIR: dataDir, LOG_LEVEL: 'silent' });
  const config = {
    ...base,
    database: 'memory' as const,
    rateLimit: opts.rateLimit ?? false,
    staticDir: opts.staticDir ?? path.join(dataDir, 'no-site'),
    ...opts.config,
  };
  const db = await testDatabase();
  let now = new Date(opts.now ?? DEFAULT_NOW);
  const ctx: AppContext = {
    db,
    config,
    media: opts.media === undefined ? diskStore(config.uploadsDir) : opts.media,
    clock: { now: () => now },
    events: new EventHub(),
    notifier: new Notifier(null, console),
  };
  const app = await buildApp(ctx, { logger: false });
  await createUser(db, { ...ADMIN, role: 'admin' }, now);
  await createUser(db, { ...STAFF, role: 'staff' }, now);

  return {
    app,
    ctx,
    setNow: (iso) => {
      now = new Date(iso);
    },
    async login(user = ADMIN) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/staff/login',
        headers: { origin: ORIGIN },
        payload: { email: user.email, password: user.password },
      });
      if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
      const cookie = res.cookies.find((c) => c.name === 'bb_staff');
      if (!cookie) throw new Error('no session cookie');
      return (method, url, body) =>
        app.inject({
          method,
          url,
          headers: { origin: ORIGIN, cookie: `bb_staff=${cookie.value}` },
          ...(body !== undefined ? { payload: body as object } : {}),
        });
    },
    async close() {
      await app.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export function reservationPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Samira Benali',
    phone: '06 12 34 56 78',
    email: 'samira@example.com',
    date: '2026-10-06',
    time: '20:00',
    partySize: 2,
    notes: 'Table près de la fenêtre si possible',
    lang: 'fr',
    ...overrides,
  };
}

export async function postReservation(t: TestApp, payload: Record<string, unknown>, key = newKey()) {
  return t.app.inject({
    method: 'POST',
    url: '/api/public/reservations',
    headers: { 'idempotency-key': key },
    payload,
  });
}
