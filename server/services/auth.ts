import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { StaffMe, StaffUser } from '../../shared/api-types.js';
import type { StaffRole } from '../../shared/constants.js';
import type { Db, Queryable } from '../db.js';
import { AppError, conflict, notFound } from '../errors.js';
import { randomToken, sha256 } from '../lib/util.js';
import { claim, clearEvents, withdrawEvents } from '../throttle.js';

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

// ─── Login throttling ────────────────────────────────────────────────────────
// Failures are counted per (e-mail, IP) and per IP — never per e-mail alone, otherwise
// anyone could lock a colleague out of the dashboard by typing wrong passwords for them.
// The counts live in the database (see ../throttle), so every server instance shares them.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

const tooManyAttempts = () => new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many failed attempts. Try again in a few minutes.');

export async function login(
  db: Db,
  email: string,
  password: string,
  ip: string,
  now: Date,
): Promise<{ user: StaffMe; userId: number }> {
  const pairKey = `login:e:${email}|${ip}`;
  // The attempt counts as a failure until the password checks out.
  const attempt = await claim(
    db,
    [
      { key: pairKey, max: MAX_FAILURES },
      { key: `login:ip:${ip}`, max: MAX_FAILURES * 4 },
    ],
    WINDOW_MS,
    now,
  );
  if (!attempt) throw tooManyAttempts();
  const user = await db.one<UserRow>('SELECT * FROM staff_users WHERE email = ?', [email]);
  const ok = user ? await verifyPassword(password, user.password_hash) : await verifyPassword(password, await getDummyHash());
  if (!user || !ok || user.active !== 1) throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect e-mail or password');
  await withdrawEvents(db, attempt);
  await clearEvents(db, pairKey);
  await db.run('UPDATE staff_users SET last_login_at = ? WHERE id = ?', [now.toISOString(), user.id]);
  return { user: toMe(user), userId: user.id };
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function createSession(db: Queryable, userId: number, ttlMs: number, now: Date): Promise<string> {
  const token = randomToken(32);
  const ts = now.toISOString();
  await db.run('INSERT INTO staff_sessions (id_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)', [
    sha256(token),
    userId,
    ts,
    new Date(now.getTime() + ttlMs).toISOString(),
    ts,
  ]);
  await db.run('DELETE FROM staff_sessions WHERE expires_at < ?', [ts]);
  return token;
}

/** Returns the signed-in user and slides the session expiry forward. */
export async function getSessionUser(db: Queryable, token: string | undefined, ttlMs: number, now: Date): Promise<StaffMe | null> {
  if (!token || token.length > 200) return null;
  const idHash = sha256(token);
  const row = await db.one<UserRow & { s_expires: string; s_seen: string }>(
    `SELECT u.*, s.expires_at AS s_expires, s.last_seen_at AS s_seen FROM staff_sessions s
     JOIN staff_users u ON u.id = s.user_id WHERE s.id_hash = ?`,
    [idHash],
  );
  if (!row || row.active !== 1 || new Date(row.s_expires) <= now) return null;
  if (now.getTime() - new Date(row.s_seen).getTime() > 60_000) {
    await db.run('UPDATE staff_sessions SET last_seen_at = ?, expires_at = ? WHERE id_hash = ?', [
      now.toISOString(),
      new Date(now.getTime() + ttlMs).toISOString(),
      idHash,
    ]);
  }
  return toMe(row);
}

export async function destroySession(db: Queryable, token: string | undefined): Promise<void> {
  if (token) await db.run('DELETE FROM staff_sessions WHERE id_hash = ?', [sha256(token)]);
}

// ─── Staff accounts ──────────────────────────────────────────────────────────

export async function listUsers(db: Queryable): Promise<StaffUser[]> {
  return (await db.many<UserRow>('SELECT * FROM staff_users ORDER BY created_at, id')).map(toUser);
}

export async function countUsers(db: Queryable): Promise<number> {
  return (await db.one<{ n: number }>('SELECT COUNT(*) AS n FROM staff_users'))!.n;
}

export async function createUser(
  db: Queryable,
  input: { email: string; name: string; role: StaffRole; password: string },
  now: Date,
): Promise<StaffUser> {
  if (await db.one('SELECT 1 FROM staff_users WHERE email = ?', [input.email])) throw emailTaken();
  const hash = await hashPassword(input.password);
  // ON CONFLICT covers two creations of the same e-mail racing each other.
  const row = await db.one<UserRow>(
    `INSERT INTO staff_users (email, name, role, password_hash, active, created_at) VALUES (?, ?, ?, ?, 1, ?)
     ON CONFLICT (email) DO NOTHING RETURNING *`,
    [input.email, input.name, input.role, hash, now.toISOString()],
  );
  if (!row) throw emailTaken();
  return toUser(row);
}

const emailTaken = () => conflict('EMAIL_TAKEN', 'An account already exists for this e-mail');

export async function updateUser(
  db: Db,
  id: number,
  patch: { name?: string; role?: StaffRole; active?: boolean; password?: string },
  actingUserId: number,
): Promise<StaffUser> {
  // Hashing is slow: do it before taking the lock.
  const hash = patch.password !== undefined ? await hashPassword(patch.password) : undefined;
  // One account change at a time, so two admins demoting each other can't leave the restaurant without one.
  return db.tx(
    async (tx) => {
      const user = await tx.one<UserRow>('SELECT * FROM staff_users WHERE id = ?', [id]);
      if (!user) throw notFound('User');
      if (id === actingUserId && (patch.active === false || (patch.role && patch.role !== user.role))) {
        throw conflict('SELF_LOCKOUT', 'You cannot deactivate your own account or change your own role');
      }
      if ((patch.active === false || patch.role === 'staff') && user.role === 'admin') {
        const admins = await tx.one<{ n: number }>(`SELECT COUNT(*) AS n FROM staff_users WHERE role = 'admin' AND active = 1`);
        if (admins!.n <= 1) throw conflict('LAST_ADMIN', 'At least one active administrator is required');
      }
      const sets: string[] = [];
      const params: unknown[] = [];
      if (patch.name !== undefined) (sets.push('name = ?'), params.push(patch.name));
      if (patch.role !== undefined) (sets.push('role = ?'), params.push(patch.role));
      if (patch.active !== undefined) (sets.push('active = ?'), params.push(patch.active ? 1 : 0));
      if (hash !== undefined) (sets.push('password_hash = ?'), params.push(hash));
      if (sets.length > 0) await tx.run(`UPDATE staff_users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
      if (patch.active === false || hash !== undefined) {
        await tx.run('DELETE FROM staff_sessions WHERE user_id = ?', [id]);
      }
      return toUser((await tx.one<UserRow>('SELECT * FROM staff_users WHERE id = ?', [id]))!);
    },
    { lock: 'staff_users' },
  );
}

/**
 * Changes the signed-in user's password and signs out their other sessions (a stolen
 * cookie or a forgotten tablet stops working). Wrong current passwords are throttled.
 */
export async function changeOwnPassword(
  db: Db,
  userId: number,
  current: string,
  next: string,
  opts: { keepSession: string | undefined; now: Date },
): Promise<void> {
  const key = `pw:${userId}`;
  const attempt = await claim(db, [{ key, max: MAX_FAILURES }], WINDOW_MS, opts.now);
  if (!attempt) throw tooManyAttempts();
  const user = await db.one<UserRow>('SELECT * FROM staff_users WHERE id = ?', [userId]);
  if (!user || !(await verifyPassword(current, user.password_hash))) {
    throw new AppError(400, 'VALIDATION', 'Current password is incorrect', { fields: { currentPassword: 'wrong_password' } });
  }
  await withdrawEvents(db, attempt);
  await clearEvents(db, key);
  const hash = await hashPassword(next);
  await db.tx(async (tx) => {
    await tx.run('UPDATE staff_users SET password_hash = ? WHERE id = ?', [hash, userId]);
    await tx.run('DELETE FROM staff_sessions WHERE user_id = ? AND id_hash != ?', [userId, sha256(opts.keepSession ?? '')]);
  });
}
