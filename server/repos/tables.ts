import type { StaffTable } from '../../shared/api-types.js';
import { atomically, type Db, type Queryable, rowId } from '../db.js';
import { conflict, notFound } from '../errors.js';
import { newTableCode, normalizeTableNumber } from '../lib/util.js';

/**
 * Advisory lock held while a table is created, edited or given a new QR code, so the "is this
 * number / code still free?" check and the write that follows never interleave with another request's.
 */
export const TABLES_LOCK = 'dining_tables';

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

export async function listTables(q: Queryable): Promise<StaffTable[]> {
  const rows = await q.many<TableRow>('SELECT * FROM dining_tables ORDER BY sort_order, id');
  return rows.map(toTable);
}

export async function allTablesNumeric(q: Queryable): Promise<boolean> {
  const rows = await q.many<{ number: string }>('SELECT number FROM dining_tables WHERE active = 1');
  return rows.every((r) => /^\d+$/.test(r.number.trim()));
}

export async function getTable(q: Queryable, id: number): Promise<StaffTable | null> {
  const row = await q.one<TableRow>('SELECT * FROM dining_tables WHERE id = ?', [rowId(id)]);
  return row ? toTable(row) : null;
}

export async function findTableByCode(q: Queryable, code: string): Promise<StaffTable | null> {
  const value = code.trim().toLowerCase();
  if (value.includes('\0')) return null; // no table has one, and Postgres rejects NUL in text
  const row = await q.one<TableRow>('SELECT * FROM dining_tables WHERE code = ?', [value]);
  return row ? toTable(row) : null;
}

export async function findTableByNumber(q: Queryable, input: string): Promise<StaffTable | null> {
  const key = normalizeTableNumber(input);
  if (!key || key.includes('\0')) return null;
  const row = await q.one<TableRow>('SELECT * FROM dining_tables WHERE number_key = ?', [key]);
  return row ? toTable(row) : null;
}

async function uniqueCode(q: Queryable): Promise<string> {
  for (;;) {
    const code = newTableCode();
    if (!(await q.one('SELECT 1 FROM dining_tables WHERE code = ?', [code]))) return code;
  }
}

async function assertNumberFree(q: Queryable, number: string, exceptId?: number): Promise<string> {
  const key = normalizeTableNumber(number);
  const clash = await q.one<{ id: number }>('SELECT id FROM dining_tables WHERE number_key = ?', [key]);
  if (clash && clash.id !== exceptId) throw conflict('TABLE_NUMBER_TAKEN', `Table "${number}" already exists`);
  return key;
}

export async function createTable(
  db: Db | Queryable,
  input: { number: string; seats: number; area: string | null; active: boolean },
  now: Date,
): Promise<StaffTable> {
  return atomically(db, TABLES_LOCK, async (q) => {
    const key = await assertNumberFree(q, input.number);
    const max = (await q.one<{ m: number }>('SELECT COALESCE(MAX(sort_order), 0) AS m FROM dining_tables'))!;
    const code = await uniqueCode(q);
    const ts = now.toISOString();
    const row = await q.one<TableRow>(
      `INSERT INTO dining_tables (number, number_key, code, seats, area, active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      [input.number.trim(), key, code, input.seats, input.area, input.active ? 1 : 0, max.m + 1, ts, ts],
    );
    return toTable(row!);
  });
}

export async function updateTable(
  db: Db | Queryable,
  id: number,
  input: { number: string; seats: number; area: string | null; active: boolean },
  now: Date,
): Promise<StaffTable> {
  return atomically(db, TABLES_LOCK, async (q) => {
    if (!(await getTable(q, id))) throw notFound('Table');
    const key = await assertNumberFree(q, input.number, id);
    const row = await q.one<TableRow>(
      `UPDATE dining_tables SET number = ?, number_key = ?, seats = ?, area = ?, active = ?, updated_at = ? WHERE id = ?
       RETURNING *`,
      [input.number.trim(), key, input.seats, input.area, input.active ? 1 : 0, now.toISOString(), id],
    );
    if (!row) throw notFound('Table'); // deleted meanwhile
    return toTable(row);
  });
}

/** Issues a new QR code for a table; previously printed codes stop working. */
export async function regenerateTableCode(db: Db | Queryable, id: number, now: Date): Promise<StaffTable> {
  return atomically(db, TABLES_LOCK, async (q) => {
    const code = await uniqueCode(q);
    const row = await q.one<TableRow>('UPDATE dining_tables SET code = ?, updated_at = ? WHERE id = ? RETURNING *', [
      code,
      now.toISOString(),
      rowId(id),
    ]);
    if (!row) throw notFound('Table');
    return toTable(row);
  });
}

export async function deleteTable(q: Queryable, id: number): Promise<void> {
  if ((await q.run('DELETE FROM dining_tables WHERE id = ?', [rowId(id)])) === 0) throw notFound('Table');
}

export async function reorderTables(db: Db | Queryable, ids: number[]): Promise<void> {
  await atomically(db, TABLES_LOCK, async (q) => {
    for (const [i, id] of ids.entries()) await q.run('UPDATE dining_tables SET sort_order = ? WHERE id = ?', [i + 1, rowId(id)]);
  });
}
