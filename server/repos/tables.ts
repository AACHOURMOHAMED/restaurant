import type { StaffTable } from '../../shared/api-types';
import type { DB } from '../db';
import { conflict, notFound } from '../errors';
import { newTableCode, normalizeTableNumber } from '../lib/util';

type TableRow = {
  id: number;
  number: string;
  number_key: string;
  code: string;
  seats: number;
  area: string | null;
  active: number;
  sort_order: number;
};

const toTable = (r: TableRow): StaffTable => ({
  id: r.id,
  number: r.number,
  code: r.code,
  seats: r.seats,
  area: r.area,
  active: r.active === 1,
  sortOrder: r.sort_order,
});

export function listTables(db: DB): StaffTable[] {
  const rows = db.prepare('SELECT * FROM dining_tables ORDER BY sort_order, id').all() as TableRow[];
  return rows.map(toTable);
}

export function allTablesNumeric(db: DB): boolean {
  const rows = db.prepare('SELECT number FROM dining_tables WHERE active = 1').all() as { number: string }[];
  return rows.every((r) => /^\d+$/.test(r.number.trim()));
}

export function getTable(db: DB, id: number): StaffTable | null {
  const row = db.prepare('SELECT * FROM dining_tables WHERE id = ?').get(id) as TableRow | undefined;
  return row ? toTable(row) : null;
}

export function findTableByCode(db: DB, code: string): StaffTable | null {
  const row = db.prepare('SELECT * FROM dining_tables WHERE code = ?').get(code.trim().toLowerCase()) as
    | TableRow
    | undefined;
  return row ? toTable(row) : null;
}

export function findTableByNumber(db: DB, input: string): StaffTable | null {
  const key = normalizeTableNumber(input);
  if (!key) return null;
  const row = db.prepare('SELECT * FROM dining_tables WHERE number_key = ?').get(key) as TableRow | undefined;
  return row ? toTable(row) : null;
}

function uniqueCode(db: DB): string {
  for (;;) {
    const code = newTableCode();
    if (!db.prepare('SELECT 1 FROM dining_tables WHERE code = ?').get(code)) return code;
  }
}

function assertNumberFree(db: DB, number: string, exceptId?: number) {
  const key = normalizeTableNumber(number);
  const clash = db.prepare('SELECT id FROM dining_tables WHERE number_key = ?').get(key) as { id: number } | undefined;
  if (clash && clash.id !== exceptId) throw conflict('TABLE_NUMBER_TAKEN', `Table "${number}" already exists`);
  return key;
}

export function createTable(
  db: DB,
  input: { number: string; seats: number; area: string | null; active: boolean },
  now: Date,
): StaffTable {
  const key = assertNumberFree(db, input.number);
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM dining_tables').get() as { m: number };
  const ts = now.toISOString();
  const info = db
    .prepare(
      `INSERT INTO dining_tables (number, number_key, code, seats, area, active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.number.trim(), key, uniqueCode(db), input.seats, input.area, input.active ? 1 : 0, max.m + 1, ts, ts);
  return getTable(db, Number(info.lastInsertRowid))!;
}

export function updateTable(
  db: DB,
  id: number,
  input: { number: string; seats: number; area: string | null; active: boolean },
  now: Date,
): StaffTable {
  if (!getTable(db, id)) throw notFound('Table');
  const key = assertNumberFree(db, input.number, id);
  db.prepare(
    `UPDATE dining_tables SET number = ?, number_key = ?, seats = ?, area = ?, active = ?, updated_at = ? WHERE id = ?`,
  ).run(input.number.trim(), key, input.seats, input.area, input.active ? 1 : 0, now.toISOString(), id);
  return getTable(db, id)!;
}

/** Issues a new QR code for a table; previously printed codes stop working. */
export function regenerateTableCode(db: DB, id: number, now: Date): StaffTable {
  if (!getTable(db, id)) throw notFound('Table');
  db.prepare('UPDATE dining_tables SET code = ?, updated_at = ? WHERE id = ?').run(uniqueCode(db), now.toISOString(), id);
  return getTable(db, id)!;
}

export function deleteTable(db: DB, id: number): void {
  if (db.prepare('DELETE FROM dining_tables WHERE id = ?').run(id).changes === 0) throw notFound('Table');
}

export function reorderTables(db: DB, ids: number[]): void {
  const stmt = db.prepare('UPDATE dining_tables SET sort_order = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, i) => stmt.run(i + 1, id)))();
}
