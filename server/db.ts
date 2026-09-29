/**
 * Database access: PostgreSQL everywhere.
 *
 *  - Production on Vercel (or any host with a Postgres server): `DATABASE_URL` → node-postgres pool
 *    (Neon from the Vercel Marketplace sets it).
 *  - Local development, Docker self-hosting and tests: PGlite, a complete Postgres that runs inside
 *    the Node process and stores its data in a folder (`DATA_DIR/pgdata`) — nothing to install.
 *
 * SQL is written with `?` placeholders (converted to `$1…$n`). Every query inside a transaction must
 * use the transaction handle passed to the callback: using the outer handle there is a bug (it would
 * run on another connection, or wait forever on PGlite's single one), so it throws.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

export type Row = Record<string, unknown>;

/** Anything that runs queries: the database itself, or a transaction. */
export interface Queryable {
  /** All rows. */
  many<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** First row, or undefined. */
  one<T = Row>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Runs a statement; returns the number of affected rows. */
  run(sql: string, params?: unknown[]): Promise<number>;
}

export interface Db extends Queryable {
  readonly kind: 'postgres' | 'pglite';
  /**
   * Runs `fn` in a transaction. `lock` first takes a transaction-scoped advisory lock on that name,
   * so transactions with the same lock run one after the other (e.g. bookings for one date).
   */
  tx<T>(fn: (q: Queryable) => Promise<T>, opts?: { lock?: string }): Promise<T>;
  /** Several statements at once (migrations). */
  exec(sql: string): Promise<void>;
  /** Embedded database only: writes a compressed copy of the whole database to `file`. */
  backup?(file: string): Promise<void>;
  close(): Promise<void>;
}

/** Kept for readability at call sites that only need to run queries. */
export type DB = Db;

// ─── `?` → `$n` ──────────────────────────────────────────────────────────────

const converted = new Map<string, string>();

/** Converts `?` placeholders to `$1…$n`, leaving string literals, identifiers and comments alone. */
export function toPositional(sql: string): string {
  const cached = converted.get(sql);
  if (cached !== undefined) return cached;
  let out = '';
  let n = 0;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]!;
    if (c === "'" || c === '"') {
      const end = sql.indexOf(c, i + 1);
      const stop = end === -1 ? sql.length : end;
      out += sql.slice(i, stop + 1);
      i = stop;
    } else if (c === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop - 1;
    } else if (c === '?') {
      out += `$${++n}`;
    } else {
      out += c;
    }
  }
  if (converted.size < 2000) converted.set(sql, out);
  return out;
}

// ─── Transaction guard ───────────────────────────────────────────────────────

const inTransaction = new AsyncLocalStorage<boolean>();

function assertOutsideTransaction() {
  if (inTransaction.getStore()) {
    throw new Error('Query on the outer database handle inside a transaction — use the transaction handle.');
  }
}

// ─── node-postgres (production) ──────────────────────────────────────────────

// COUNT(*) and other BIGINT results arrive as strings by default; every count here fits in a number.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

function pgQueryable(client: pg.Pool | pg.PoolClient, guard: boolean): Queryable {
  const query = async (sql: string, params: unknown[] = []) => {
    if (guard) assertOutsideTransaction();
    return client.query(toPositional(sql), params);
  };
  return {
    many: async <T>(sql: string, params?: unknown[]) => (await query(sql, params)).rows as T[],
    one: async <T>(sql: string, params?: unknown[]) => (await query(sql, params)).rows[0] as T | undefined,
    run: async (sql, params) => (await query(sql, params)).rowCount ?? 0,
  };
}

export function postgresDb(pool: pg.Pool): Db {
  return {
    kind: 'postgres',
    ...pgQueryable(pool, true),
    async tx(fn, opts) {
      assertOutsideTransaction();
      const client = await pool.connect();
      try {
        // READ COMMITTED (the PostgreSQL default, pinned here): after taking the advisory lock, each
        // statement sees everything committed before it, which is what the capacity checks rely on.
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        if (opts?.lock) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [opts.lock]);
        const result = await inTransaction.run(true, () => fn(pgQueryable(client, false)));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    async exec(sql) {
      assertOutsideTransaction();
      await pool.query(sql);
    },
    close: () => pool.end(),
  };
}

// ─── PGlite (development, Docker, tests) ─────────────────────────────────────

type PgliteRunner = Pick<PGlite, 'query'>;

function pgliteQueryable(runner: PgliteRunner, guard: boolean): Queryable {
  const query = async <T>(sql: string, params: unknown[] = []) => {
    if (guard) assertOutsideTransaction();
    return runner.query<T>(toPositional(sql), params);
  };
  return {
    many: async <T>(sql: string, params?: unknown[]) => (await query<T>(sql, params)).rows,
    one: async <T>(sql: string, params?: unknown[]) => (await query<T>(sql, params)).rows[0],
    run: async (sql, params) => (await query(sql, params)).affectedRows ?? 0,
  };
}

export function pgliteDb(instance: PGlite, onClose: () => void = () => undefined): Db {
  return {
    kind: 'pglite',
    ...pgliteQueryable(instance, true),
    async tx(fn, opts) {
      assertOutsideTransaction();
      return instance.transaction(async (t) => {
        if (opts?.lock) await t.query('SELECT pg_advisory_xact_lock(hashtext($1))', [opts.lock]);
        return inTransaction.run(true, () => fn(pgliteQueryable(t, false)));
      });
    },
    async exec(sql) {
      assertOutsideTransaction();
      await instance.exec(sql);
    },
    async backup(file) {
      assertOutsideTransaction();
      const dump = await instance.dumpDataDir('gzip');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(await dump.arrayBuffer()));
    },
    async close() {
      await instance.close();
      onClose();
    },
  };
}

/**
 * The embedded database must only ever be opened by one process at a time (two would corrupt it,
 * and PGlite doesn't prevent it), so a lock file next to its folder records the owner — host name
 * and process id — and is touched every few seconds while in use. A lock whose owner is gone (a dead
 * process on this machine, or one not touched for a while: another container that stopped) is taken over.
 */
const LOCK_HEARTBEAT_MS = 5_000;
const LOCK_STALE_MS = 30_000;

function lockDataDir(dir: string): () => void {
  const file = `${dir}.lock`;
  const me = `${os.hostname()} ${process.pid}`;
  try {
    fs.writeFileSync(file, me, { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    const [host, pidText] = fs.readFileSync(file, 'utf8').trim().split(' ');
    const pid = Number(pidText);
    const alive =
      host === os.hostname()
        ? pid !== process.pid && isRunning(pid)
        : Date.now() - fs.statSync(file).mtimeMs < LOCK_STALE_MS;
    if (alive) {
      throw new Error(
        `The database in ${dir} is being used by another process (${host}, pid ${pidText}), probably the running server. ` +
          'Stop it first — or use a PostgreSQL server (DATABASE_URL), which can be shared.',
      );
    }
    fs.writeFileSync(file, me);
  }
  const heartbeat = setInterval(() => {
    try {
      const t = new Date();
      fs.utimesSync(file, t, t);
    } catch {
      // Removed meanwhile: nothing to keep fresh.
    }
  }, LOCK_HEARTBEAT_MS);
  heartbeat.unref();
  const release = () => {
    clearInterval(heartbeat);
    try {
      if (fs.readFileSync(file, 'utf8') === me) fs.rmSync(file);
    } catch {
      // Already gone.
    }
  };
  process.once('exit', release);
  return release;
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// ─── Helpers for repositories ───────────────────────────────────────────────

/**
 * Ids arrive unbounded from requests; one beyond INTEGER can't exist (and Postgres would reject the
 * query), so it becomes 0, which matches no row.
 */
export const rowId = (id: number) => (Number.isInteger(id) && id > 0 && id <= 2_147_483_647 ? id : 0);

const isDatabase = (q: Queryable): q is Db => typeof (q as Partial<Db>).tx === 'function';

/**
 * Runs `fn` atomically, holding the advisory lock `lock` if one is named: in a transaction of its own
 * when given the database, or inside the caller's transaction when given a transaction handle.
 */
export async function atomically<T>(db: Db | Queryable, lock: string | null, fn: (q: Queryable) => Promise<T>): Promise<T> {
  if (isDatabase(db)) return db.tx(fn, lock ? { lock } : undefined);
  if (lock) await db.one('SELECT pg_advisory_xact_lock(hashtext(?))', [lock]); // re-entrant: free if already held
  return fn(db);
}

// ─── Opening ─────────────────────────────────────────────────────────────────

export type DatabaseTarget = { url: string } | { dir: string } | 'memory';

/** Opens the database and brings its schema up to date. */
export async function openDatabase(target: DatabaseTarget): Promise<Db> {
  let db: Db;
  if (typeof target === 'object' && 'url' in target) {
    const pool = new pg.Pool({ connectionString: target.url, max: Number(process.env.PG_POOL_MAX ?? 5), idleTimeoutMillis: 10_000 });
    if (process.env.VERCEL) {
      // Lets Vercel close idle connections before a function instance is suspended.
      const { attachDatabasePool } = await import('@vercel/functions');
      attachDatabasePool(pool);
    }
    db = postgresDb(pool);
  } else {
    const dir = target === 'memory' ? undefined : target.dir;
    let release = () => undefined as void;
    if (dir) {
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      release = lockDataDir(dir);
    }
    try {
      // Loaded on demand: hosted deployments (DATABASE_URL) never need it.
      const { PGlite, types } = await import('@electric-sql/pglite');
      const instance = await PGlite.create(dir ?? 'memory://', { parsers: { [types.INT8]: (v: string) => Number(v) } });
      db = pgliteDb(instance, release);
    } catch (err) {
      release();
      throw err;
    }
  }
  await migrate(db);
  return db;
}

/** Recreates an embedded database folder from a `backup` file. The folder must not exist yet. */
export async function restoreEmbedded(dir: string, file: string): Promise<void> {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
    throw new Error(`${dir} already contains a database: stop the server and move that folder aside first.`);
  }
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const release = lockDataDir(dir);
  try {
    const { PGlite } = await import('@electric-sql/pglite');
    const instance = await PGlite.create(dir, { loadDataDir: new Blob([fs.readFileSync(file)]) });
    await instance.query('SELECT 1');
    await instance.close();
  } finally {
    release();
  }
}

// ─── Schema ──────────────────────────────────────────────────────────────────

/**
 * Schema migrations, applied in order and recorded in `schema_migrations`.
 * Never edit a migration that has shipped — add a new one instead.
 * Dates/times are ISO-8601 text (they compare correctly as strings); booleans are 0/1 integers.
 */
const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: /* sql */ `
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE special_days (
        date TEXT PRIMARY KEY,
        closed INTEGER NOT NULL DEFAULT 1,
        hours TEXT NOT NULL DEFAULT '[]',
        note TEXT
      );

      CREATE TABLE dining_tables (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        number TEXT NOT NULL,
        number_key TEXT NOT NULL UNIQUE,
        code TEXT NOT NULL UNIQUE,
        seats INTEGER NOT NULL DEFAULT 2,
        area TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE reservations (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        reference TEXT NOT NULL UNIQUE,
        token_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        party_size INTEGER NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        phone_digits TEXT NOT NULL,
        email TEXT,
        notes TEXT,
        staff_note TEXT,
        table_id INTEGER REFERENCES dining_tables(id) ON DELETE SET NULL,
        source TEXT NOT NULL DEFAULT 'web',
        lang TEXT NOT NULL DEFAULT 'fr',
        idempotency_key TEXT UNIQUE,
        anonymized INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_reservations_date ON reservations(date, time);
      CREATE INDEX idx_reservations_status ON reservations(status);
      CREATE INDEX idx_reservations_phone ON reservations(phone_digits, date);

      CREATE TABLE reservation_events (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        actor TEXT NOT NULL,
        at TEXT NOT NULL
      );
      CREATE INDEX idx_reservation_events_reservation ON reservation_events(reservation_id);

      CREATE TABLE menu_categories (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        name TEXT NOT NULL,
        name_en TEXT,
        description TEXT,
        description_en TEXT,
        visible INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_demo INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE menu_items (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        category_id INTEGER NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        name_en TEXT,
        description TEXT,
        description_en TEXT,
        price_cents INTEGER NOT NULL,
        image TEXT,
        dietary TEXT NOT NULL DEFAULT '[]',
        available INTEGER NOT NULL DEFAULT 1,
        visible INTEGER NOT NULL DEFAULT 1,
        is_special INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_demo INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_menu_items_category ON menu_items(category_id, sort_order);

      CREATE TABLE menu_option_groups (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        name_en TEXT,
        min_select INTEGER NOT NULL DEFAULT 0,
        max_select INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_option_groups_item ON menu_option_groups(item_id);

      CREATE TABLE menu_options (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES menu_option_groups(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        name_en TEXT,
        price_delta_cents INTEGER NOT NULL DEFAULT 0,
        available INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_options_group ON menu_options(group_id);

      CREATE TABLE orders (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        reference TEXT NOT NULL UNIQUE,
        token_hash TEXT NOT NULL UNIQUE,
        table_id INTEGER REFERENCES dining_tables(id) ON DELETE SET NULL,
        table_number TEXT NOT NULL,
        status TEXT NOT NULL,
        note TEXT,
        total_cents INTEGER NOT NULL,
        currency TEXT NOT NULL,
        lang TEXT NOT NULL DEFAULT 'fr',
        idempotency_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_orders_status ON orders(status, created_at);
      CREATE INDEX idx_orders_created ON orders(created_at);

      CREATE TABLE order_lines (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        name_en TEXT,
        quantity INTEGER NOT NULL,
        unit_price_cents INTEGER NOT NULL,
        line_total_cents INTEGER NOT NULL,
        options TEXT NOT NULL DEFAULT '[]',
        note TEXT,
        position INTEGER NOT NULL
      );
      CREATE INDEX idx_order_lines_order ON order_lines(order_id);

      CREATE TABLE order_events (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        actor TEXT NOT NULL,
        at TEXT NOT NULL
      );
      CREATE INDEX idx_order_events_order ON order_events(order_id);

      CREATE TABLE staff_users (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        last_login_at TEXT
      );

      CREATE TABLE staff_sessions (
        id_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE INDEX idx_sessions_user ON staff_sessions(user_id);

      -- Sign-in failures, booking caps…: counted here so every server instance sees the same numbers.
      CREATE TABLE throttle_events (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        key TEXT NOT NULL,
        at_ms BIGINT NOT NULL
      );
      CREATE INDEX idx_throttle_events ON throttle_events(key, at_ms);
    `,
  },
];

/** Applies pending migrations. Safe when several server instances start at once (advisory lock). */
export async function migrate(db: Db): Promise<void> {
  await db.tx(
    async (q) => {
      await q.run('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
      const applied = new Set((await q.many<{ version: number }>('SELECT version FROM schema_migrations')).map((r) => r.version));
      for (const m of MIGRATIONS) {
        if (applied.has(m.version)) continue;
        for (const statement of splitStatements(m.sql)) await q.run(statement);
        await q.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [m.version, new Date().toISOString()]);
      }
    },
    { lock: 'schema_migrations' },
  );
}

/** Splits a migration into statements (our migrations contain no semicolons inside strings). */
function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}
