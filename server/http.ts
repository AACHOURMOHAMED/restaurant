import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { StaffMe } from '../shared/api-types.js';
import type { StaffRole } from '../shared/constants.js';
import type { AppContext } from './context.js';
import { AppError, badRequest } from './errors.js';
import { getSessionUser } from './services/auth.js';

export const STAFF_COOKIE = 'bb_staff';

declare module 'fastify' {
  interface FastifyRequest {
    staff: StaffMe | null;
  }
}

/** Parses with a Zod schema; failures become 400 VALIDATION errors with per-field codes. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw result.error;
  return result.data;
}

export function idParam(req: FastifyRequest): number {
  const id = Number((req.params as { id?: string }).id);
  if (!Number.isInteger(id) || id <= 0 || id > 2_147_483_647) throw badRequest('VALIDATION', 'Invalid id');
  return id;
}

/** Required on POSTs that create something, so retries and double taps never create duplicates. */
export function idempotencyKey(req: FastifyRequest): string {
  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(key)) {
    throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required');
  }
  return key;
}

function hostnameOf(value: string, withScheme: boolean): string | null {
  try {
    return new URL(withScheme ? value : `http://${value}`).hostname;
  } catch {
    return null;
  }
}

/**
 * Cross-site request protection for cookie-authenticated staff requests: the
 * Origin (or Referer) must name this site. Host names are compared without
 * ports/schemes so it also works behind TLS-terminating proxies.
 */
export function isSameOrigin(req: FastifyRequest, publicUrl: string | null): boolean {
  const raw = req.headers.origin ?? req.headers.referer;
  if (typeof raw !== 'string' || raw === 'null') return false;
  const origin = hostnameOf(raw, true);
  if (!origin) return false;
  if (origin === hostnameOf(req.host, false)) return true;
  return publicUrl !== null && origin === hostnameOf(publicUrl, true);
}

export function staffGuard(ctx: AppContext, role?: StaffRole) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const token = req.cookies[STAFF_COOKIE];
    const user = await getSessionUser(ctx.db, token, ctx.config.sessionTtlMs, ctx.clock.now());
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Please sign in');
    if (req.method !== 'GET' && req.method !== 'HEAD' && !isSameOrigin(req, ctx.config.publicUrl)) {
      throw new AppError(403, 'CSRF', 'Cross-site request refused');
    }
    if (role === 'admin' && user.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Administrator access required');
    }
    req.staff = user;
  };
}

export const actorOf = (req: FastifyRequest) => `staff:${req.staff?.id ?? 'unknown'}`;
