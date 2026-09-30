import type { ApiErrorBody } from '@shared/api-types';
import type { Dictionary } from '@/i18n/fr';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Makes retries safe: the server returns the original result for a repeated key. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  formData?: FormData;
};

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined || opts.formData ? 'POST' : 'GET'),
      headers,
      body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      credentials: 'same-origin',
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Network error');
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // Hosting refusing a too-big upload before it reaches the server (Vercel: over 4.5 MB).
      if (res.status === 413) throw new ApiError(413, 'IMAGE_TOO_LARGE', 'Upload too large');
      // Not JSON: typically a static host answering without the booking backend.
      throw new ApiError(res.status, 'BACKEND_UNAVAILABLE', 'The booking service is not reachable');
    }
  }
  if (!res.ok) {
    const e = (data as ApiErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      e?.code ?? (res.status >= 500 ? 'INTERNAL' : `HTTP_${res.status}`),
      e?.message ?? res.statusText,
      e?.fields,
      e?.details,
    );
  }
  return data as T;
}

/** Human message for any error, in the current language. */
export function errorMessage(t: Dictionary, err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return t.errors.network!;
    return t.errors[err.code] ?? t.errors.generic!;
  }
  return t.errors.generic!;
}

/** Field-level messages from a validation error. */
export function fieldErrors(t: Dictionary, err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !err.fields) return {};
  const out: Record<string, string> = {};
  for (const [k, code] of Object.entries(err.fields)) out[k] = t.fields[code] ?? t.fields.invalid!;
  return out;
}
