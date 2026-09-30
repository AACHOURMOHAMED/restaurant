/**
 * Counters for abuse protection (failed sign-ins, booking caps…), kept in the database so every
 * server instance — Vercel runs many — sees the same numbers. Only keys are stored (e.g.
 * "login:<email>|<ip>"), and rows older than two days are cleaned up as new ones arrive.
 */
import type { Db, Queryable } from './db.js';

const KEEP_MS = 2 * 24 * 3_600_000;

/** Events recorded for `key` within the last `windowMs` (relative to `now`). */
export async function recentCount(q: Queryable, key: string, windowMs: number, now: Date): Promise<number> {
  const row = await q.one<{ n: number }>('SELECT COUNT(*) AS n FROM throttle_events WHERE key = ? AND at_ms > ?', [
    key,
    now.getTime() - windowMs,
  ]);
  return row?.n ?? 0;
}

/** Records one event; returns its id (see `withdrawEvents`). */
export async function recordEvent(q: Queryable, key: string, now: Date): Promise<number> {
  const row = await q.one<{ id: number }>('INSERT INTO throttle_events (key, at_ms) VALUES (?, ?) RETURNING id', [key, now.getTime()]);
  // Cheap housekeeping: about one call in fifty sweeps expired rows.
  if (Math.random() < 0.02) await q.run('DELETE FROM throttle_events WHERE at_ms < ?', [now.getTime() - KEEP_MS]);
  return row!.id;
}

export async function withdrawEvents(q: Queryable, ids: number[]): Promise<void> {
  if (ids.length > 0) await q.run('DELETE FROM throttle_events WHERE id = ANY(?::bigint[])', [ids]);
}

export async function clearEvents(q: Queryable, key: string): Promise<void> {
  await q.run('DELETE FROM throttle_events WHERE key = ?', [key]);
}

/**
 * Takes one use of every limit at once, or none: returns the recorded event ids (hand them to
 * `withdrawEvents` if the attempt turns out not to count), or null when any limit is already reached.
 * Checking and recording happen under a lock per key, so a burst of parallel requests gets exactly
 * the allowed number through — not more, and not fewer.
 */
export async function claim(
  db: Db,
  limits: { key: string; max: number }[],
  windowMs: number,
  now: Date,
): Promise<number[] | null> {
  return db.tx(async (tx) => {
    // Always in the same order, so two claims on overlapping keys can't wait for each other.
    for (const key of limits.map((l) => l.key).sort()) {
      await tx.one('SELECT pg_advisory_xact_lock(hashtext(?))', [`throttle:${key}`]);
    }
    for (const { key, max } of limits) {
      if ((await recentCount(tx, key, windowMs, now)) >= max) return null;
    }
    const ids: number[] = [];
    for (const { key } of limits) ids.push(await recordEvent(tx, key, now));
    return ids;
  });
}
