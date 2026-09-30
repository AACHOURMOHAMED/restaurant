import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../context.js';
import { AppError } from '../errors.js';
import { anonymizeOldReservations } from '../services/reservations.js';

/** Vercel Cron Jobs call these with `Authorization: Bearer <CRON_SECRET>`. */
function authorized(req: FastifyRequest, secret: string | null): boolean {
  if (!secret) return false;
  const given = crypto.createHash('sha256').update(req.headers.authorization ?? '').digest();
  const expected = crypto.createHash('sha256').update(`Bearer ${secret}`).digest();
  return crypto.timingSafeEqual(given, expected);
}

/**
 * Housekeeping that a long-running server does on a timer (see index.ts) and serverless
 * hosting does on a schedule (vercel.json → crons).
 */
export async function housekeeping(ctx: AppContext): Promise<{ erased: number }> {
  const now = ctx.clock.now();
  const erased = ctx.config.retentionDays > 0 ? await anonymizeOldReservations(ctx, ctx.config.retentionDays) : 0;
  await ctx.db.run('DELETE FROM staff_sessions WHERE expires_at < ?', [now.toISOString()]);
  await ctx.db.run('DELETE FROM throttle_events WHERE at_ms < ?', [now.getTime() - 2 * 24 * 3_600_000]);
  return { erased };
}

export async function cronRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/cron/daily', async (req) => {
    if (!authorized(req, ctx.config.cronSecret)) throw new AppError(401, 'UNAUTHORIZED', 'Unauthorized');
    const result = await housekeeping(ctx);
    if (result.erased > 0) req.log.info(`Erased personal data from ${result.erased} old reservation(s)`);
    return result;
  });
}
