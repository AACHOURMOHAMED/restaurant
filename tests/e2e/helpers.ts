import fs from 'node:fs';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import QRCode from 'qrcode';
import type { BookingCalendar, StaffTable } from '../../shared/api-types';

export const BASE = 'http://127.0.0.1:4310';
export const ADMIN = { email: 'e2e@bandbpark.test', password: 'e2e-password-123' };

let phoneCounter = Date.now() % 1_000_000;
/** A unique, valid Moroccan mobile number (avoids the duplicate-booking rule between tests). */
export const uniquePhone = () => `06${String(++phoneCounter).padStart(8, '0')}`;

/** Staff API client (cookie session + same-origin header, like the dashboard). */
export async function staff(request: APIRequestContext) {
  const login = await request.post(`${BASE}/api/staff/login`, { headers: { origin: BASE }, data: ADMIN });
  expect(login.ok(), await login.text()).toBeTruthy();
  const call = async <T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, data?: unknown): Promise<T> => {
    const res = await request.fetch(`${BASE}${url}`, { method, headers: { origin: BASE }, ...(data !== undefined ? { data } : {}) });
    expect(res.ok(), `${method} ${url} → ${res.status()} ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  };
  return {
    get: <T>(url: string) => call<T>('GET', url),
    post: <T>(url: string, data?: unknown) => call<T>('POST', url, data ?? {}),
    put: <T>(url: string, data: unknown) => call<T>('PUT', url, data),
    patch: <T>(url: string, data: unknown) => call<T>('PATCH', url, data),
    async table(number: string) {
      const tables = await call<StaffTable[]>('GET', '/api/staff/tables');
      return tables.find((t) => t.number === number)!;
    },
  };
}

export async function bookableDates(request: APIRequestContext, party = 2): Promise<string[]> {
  const cal = (await (await request.get(`${BASE}/api/public/calendar?party=${party}`)).json()) as BookingCalendar;
  return cal.days.filter((d) => d.available).map((d) => d.date);
}

/** No horizontal scrolling on phones — a classic mobile layout bug. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page is wider than the screen').toBeLessThanOrEqual(1);
}

/** Collects console errors / uncaught exceptions for a page. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of (401|404|409)/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/**
 * Writes a Y4M video showing `text` as a QR code, for Chromium's fake camera
 * (--use-file-for-fake-video-capture). Lets the in-site scanner be tested for real.
 */
export function writeQrVideo(text: string, file: string) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const W = 640;
  const H = 480;
  const quiet = 4;
  const scale = Math.floor(400 / (n + quiet * 2));
  const size = (n + quiet * 2) * scale;
  const ox = Math.floor((W - size) / 2);
  const oy = Math.floor((H - size) / 2);
  const Y = Buffer.alloc(W * H, 110); // grey table top around a white card
  for (let y = 0; y < size; y++) Y.fill(235, (oy + y) * W + ox, (oy + y) * W + ox + size);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c)) continue;
      for (let dy = 0; dy < scale; dy++) {
        const row = oy + (r + quiet) * scale + dy;
        Y.fill(16, row * W + ox + (c + quiet) * scale, row * W + ox + (c + quiet + 1) * scale);
      }
    }
  }
  const chroma = Buffer.alloc((W * H) / 2, 128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), Y, chroma]);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420jpeg\n`), frame, frame, frame]));
}
