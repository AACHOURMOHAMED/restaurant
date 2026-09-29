import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../server/app';
import { loadConfig } from '../server/config';
import { EventHub, Notifier, type AppContext } from '../server/context';
import { openDatabase } from '../server/db';
import { createUser, resetLoginThrottle } from '../server/services/auth';

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

export async function makeApp(opts: { now?: string; rateLimit?: boolean; staticDir?: string } = {}): Promise<TestApp> {
  resetLoginThrottle();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbpark-test-'));
  const base = loadConfig({ NODE_ENV: 'test', DATA_DIR: dataDir, LOG_LEVEL: 'silent' });
  const config = { ...base, rateLimit: opts.rateLimit ?? false, staticDir: opts.staticDir ?? path.join(dataDir, 'no-site') };
  const db = openDatabase(':memory:');
  let now = new Date(opts.now ?? DEFAULT_NOW);
  const ctx: AppContext = {
    db,
    config,
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
      db.close();
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
