import crypto from 'node:crypto';

/** Crockford-style alphabet without look-alike characters (no I, L, O, U, 0, 1). */
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const CODE_ALPHABET = 'abcdefghjkmnpqrstvwxyz23456789';

function randomFrom(alphabet: string, length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

/** Short, human-friendly reference, e.g. "R-7K3P9Q". */
export const newReference = (prefix: string) => `${prefix}-${randomFrom(REF_ALPHABET, 6)}`;

/** Stable, unguessable table code used in QR links. */
export const newTableCode = () => randomFrom(CODE_ALPHABET, 8);

/** Random key for uploaded images. */
export const newImageKey = () => randomFrom(CODE_ALPHABET, 16);

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export const hmac = (secret: string, value: string) =>
  crypto.createHmac('sha256', secret).update(value).digest('base64url');

export const nowIso = (now: Date) => now.toISOString();

/**
 * Normalises what a guest types for a table number so "Table 08", "table 8",
 * "#8" and "8" all match table "8".
 */
export function normalizeTableNumber(input: string): string {
  let v = input
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  v = v
    .replace(/^(?:table|tbl)(?=[\s\d#°]|$)\s*/, '')
    .replace(/^(?:n°|no\.|#)\s*/, '')
    .replace(/^no\s+(?=\d)/, '')
    .trim();
  if (/^\d+$/.test(v)) v = String(Number(v));
  return v;
}

export const phoneDigits = (phone: string) => phone.replace(/\D/g, '');

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';
