import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { StaffMe, StaffUser } from '../../shared/api-types';
import type { StaffRole } from '../../shared/constants';
import type { DB } from '../db';
import { AppError, conflict, notFound } from '../errors';
import { randomToken, sha256 } from '../lib/util';

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// A real hash of a random password, so unknown e-mails take as long as wrong passwords.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword(randomToken()));

type UserRow = {
  id: number;
  email: string;
  name: string;
  role: StaffRole;
  password_hash: string;
  active: number;
  created_at: string;
  last_login_at: string | null;
};

const toMe = (u: UserRow): StaffMe => ({ id: u.id, email: u.email, name: u.name, role: u.role });
const toUser = (u: UserRow): StaffUser => ({
  ...toMe(u),
  active: u.active === 1,
  lastLoginAt: u.last_login_at,
  createdAt: u.created_at,
});

// ─── Login throttling (in memory; per e-mail and per IP) ─────────────────────

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

function recentFailures(key: string, now: number) {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, list);
  return list;
}

export function resetLoginThrottle() {
  failures.clear();
}

export async function login(
  db: DB,
  email: string,
  password: string,
  ip: string,
  now: Date,
): Promise<{ user: StaffMe; userId: number }> {
  const keys = [`e:${email}`, `ip:${ip}`];
  const t = now.getTime();
  if (keys.some((k) => recentFailures(k, t).length >= (k.startsWith('ip:') ? MAX_FAILURES * 4 : MAX_FAILURES))) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many failed attempts. Try again in a few minutes.');
  }
  const user = db.prepare('SELECT * FROM staff_users WHERE email = ?').get(email) as UserRow | undefined;
  const ok = user ? await verifyPassword(password, user.password_hash) : await verifyPassword(password, await getDummyHash());
  if (!user || !ok || user.active !== 1) {
    for (const k of keys) recentFailures(k, t).push(t);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect e-mail or password');
  }
  failures.delete(`e:${email}`);
  db.prepare('UPDATE staff_users SET last_login_at = ? WHERE id = ?').run(now.toISOString(), user.id);
  return { user: toMe(user), userId: user.id };
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export function createSession(db: DB, userId: number, ttlMs: number, now: Date): string {
  const token = randomToken(32);
  const ts = now.toISOString();
  db.prepare(
    'INSERT INTO staff_sessions (id_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
  ).run(sha256(token), userId, ts, new Date(now.getTime() + ttlMs).toISOString(), ts);
  db.prepare('DELETE FROM staff_sessions WHERE expires_at < ?').run(ts);
  return token;
}

/** Returns the signed-in user and slides the session expiry forward. */
export function getSessionUser(db: DB, token: string | undefined, ttlMs: number, now: Date): StaffMe | null {
  if (!token || token.length > 200) return null;
  const idHash = sha256(token);
  const row = db
    .prepare(
      `SELECT u.*, s.expires_at AS s_expires, s.last_seen_at AS s_seen FROM staff_sessions s
       JOIN staff_users u ON u.id = s.user_id WHERE s.id_hash = ?`,
    )
    .get(idHash) as (UserRow & { s_expires: string; s_seen: string }) | undefined;
  if (!row || row.active !== 1 || new Date(row.s_expires) <= now) return null;
  if (now.getTime() - new Date(row.s_seen).getTime() > 60_000) {
    db.prepare('UPDATE staff_sessions SET last_seen_at = ?, expires_at = ? WHERE id_hash = ?').run(
      now.toISOString(),
      new Date(now.getTime() + ttlMs).toISOString(),
      idHash,
    );
  }
  return toMe(row);
}

export function destroySession(db: DB, token: string | undefined): void {
  if (token) db.prepare('DELETE FROM staff_sessions WHERE id_hash = ?').run(sha256(token));
}

// ─── Staff accounts ──────────────────────────────────────────────────────────

export function listUsers(db: DB): StaffUser[] {
  return (db.prepare('SELECT * FROM staff_users ORDER BY created_at').all() as UserRow[]).map(toUser);
}

export function countUsers(db: DB): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM staff_users').get() as { n: number }).n;
}

export async function createUser(
  db: DB,
  input: { email: string; name: string; role: StaffRole; password: string },
  now: Date,
): Promise<StaffUser> {
  if (db.prepare('SELECT 1 FROM staff_users WHERE email = ?').get(input.email)) {
    throw conflict('EMAIL_TAKEN', 'An account already exists for this e-mail');
  }
  const hash = await hashPassword(input.password);
  const id = db
    .prepare('INSERT INTO staff_users (email, name, role, password_hash, active, created_at) VALUES (?, ?, ?, ?, 1, ?)')
    .run(input.email, input.name, input.role, hash, now.toISOString()).lastInsertRowid;
  return toUser(db.prepare('SELECT * FROM staff_users WHERE id = ?').get(id) as UserRow);
}

export async function updateUser(
  db: DB,
  id: number,
  patch: { name?: string; role?: StaffRole; active?: boolean; password?: string },
  actingUserId: number,
): Promise<StaffUser> {
  const user = db.prepare('SELECT * FROM staff_users WHERE id = ?').get(id) as UserRow | undefined;
  if (!user) throw notFound('User');
  if (id === actingUserId && (patch.active === false || (patch.role && patch.role !== user.role))) {
    throw conflict('SELF_LOCKOUT', 'You cannot deactivate your own account or change your own role');
  }
  if ((patch.active === false || patch.role === 'staff') && user.role === 'admin') {
    const admins = db.prepare(`SELECT COUNT(*) AS n FROM staff_users WHERE role = 'admin' AND active = 1`).get() as {
      n: number;
    };
    if (admins.n <= 1) throw conflict('LAST_ADMIN', 'At least one active administrator is required');
  }
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) (sets.push('name = ?'), params.push(patch.name));
  if (patch.role !== undefined) (sets.push('role = ?'), params.push(patch.role));
  if (patch.active !== undefined) (sets.push('active = ?'), params.push(patch.active ? 1 : 0));
  if (patch.password !== undefined) (sets.push('password_hash = ?'), params.push(await hashPassword(patch.password)));
  if (sets.length > 0) db.prepare(`UPDATE staff_users SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
  if (patch.active === false || patch.password !== undefined) {
    db.prepare('DELETE FROM staff_sessions WHERE user_id = ?').run(id);
  }
  return toUser(db.prepare('SELECT * FROM staff_users WHERE id = ?').get(id) as UserRow);
}

export async function changeOwnPassword(db: DB, userId: number, current: string, next: string): Promise<void> {
  const user = db.prepare('SELECT * FROM staff_users WHERE id = ?').get(userId) as UserRow | undefined;
  if (!user || !(await verifyPassword(current, user.password_hash))) {
    throw new AppError(400, 'VALIDATION', 'Current password is incorrect', { fields: { currentPassword: 'wrong_password' } });
  }
  db.prepare('UPDATE staff_users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), userId);
}
