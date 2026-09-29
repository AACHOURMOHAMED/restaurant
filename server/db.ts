import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { phoneDigits } from './lib/util';

export type DB = Database.Database;

/**
 * Schema migrations, applied in order and recorded in `schema_migrations`.
 * Never edit a migration that has shipped — add a new one instead.
 * A migration is SQL, and/or a `run` step for data changes SQL can't express.
 */
const MIGRATIONS: { version: number; sql?: string; run?: (db: DB) => void }[] = [
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
        id INTEGER PRIMARY KEY,
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
        id INTEGER PRIMARY KEY,
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
        id INTEGER PRIMARY KEY,
        reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        actor TEXT NOT NULL,
        at TEXT NOT NULL
      );

      CREATE TABLE menu_categories (
        id INTEGER PRIMARY KEY,
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
        id INTEGER PRIMARY KEY,
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
        id INTEGER PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        name_en TEXT,
        min_select INTEGER NOT NULL DEFAULT 0,
        max_select INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_option_groups_item ON menu_option_groups(item_id);

      CREATE TABLE menu_options (
        id INTEGER PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES menu_option_groups(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        name_en TEXT,
        price_delta_cents INTEGER NOT NULL DEFAULT 0,
        available INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_options_group ON menu_options(group_id);

      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
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
        id INTEGER PRIMARY KEY,
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
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        actor TEXT NOT NULL,
        at TEXT NOT NULL
      );
      CREATE INDEX idx_order_events_order ON order_events(order_id);

      CREATE TABLE staff_users (
        id INTEGER PRIMARY KEY,
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
    `,
  },
  {
    // Keep only a fingerprint of idempotency keys. Guests' status links are derived from the
    // key and the server secret; with both stored here, a copy of the database would have been
    // enough to rebuild every status link.
    version: 2,
    run: (db) => {
      const fingerprint = (key: string) => crypto.createHash('sha256').update(key).digest('hex');
      for (const table of ['reservations', 'orders']) {
        const rows = db.prepare(`SELECT id, idempotency_key AS k FROM ${table} WHERE idempotency_key IS NOT NULL`).all() as {
          id: number;
          k: string;
        }[];
        const update = db.prepare(`UPDATE ${table} SET idempotency_key = ? WHERE id = ?`);
        for (const r of rows) update.run(fingerprint(r.k), r.id);
      }
    },
  },
  {
    // Phone numbers are compared in one form whatever the guest typed (+212…, 00212…, 0…).
    version: 3,
    run: (db) => {
      const rows = db.prepare(`SELECT id, phone FROM reservations WHERE phone != ''`).all() as { id: number; phone: string }[];
      const update = db.prepare('UPDATE reservations SET phone_digits = ? WHERE id = ?');
      for (const r of rows) update.run(phoneDigits(r.phone), r.id);
    },
  },
];

export function migrate(db: DB): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      if (m.sql) db.exec(m.sql);
      m.run?.(db);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        m.version,
        new Date().toISOString(),
      );
    })();
  }
}

export function openDatabase(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  migrate(db);
  return db;
}

/** Runs `fn` in an IMMEDIATE transaction so capacity checks and inserts are atomic. */
export function immediate<T>(db: DB, fn: () => T): T {
  return db.transaction(fn).immediate();
}
