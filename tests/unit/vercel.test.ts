import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cspHeader, PERMISSIONS_POLICY } from '../../server/headers';

type Header = { key: string; value: string };
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as {
  headers: { source: string; headers: Header[] }[];
  rewrites: { source: string; destination: string }[];
  crons: { path: string }[];
};

describe('vercel.json', () => {
  const pages = vercel.headers.find((h) => h.source === '/((?!api/).*)')!.headers;
  const header = (key: string) => pages.find((h) => h.key === key)?.value;

  it('gives static pages the same security headers as the server', () => {
    expect(header('Content-Security-Policy')).toBe(cspHeader({ blobPhotos: true, https: true }));
    expect(header('Permissions-Policy')).toBe(PERMISSIONS_POLICY);
  });

  it('sends API calls to the function and everything else to the app shell', () => {
    expect(vercel.rewrites[0]).toEqual({ source: '/api/(.*)', destination: '/api/index' });
    expect(vercel.rewrites[1]!.destination).toBe('/index.html');
    expect(vercel.crons.map((c) => c.path)).toEqual(['/api/cron/daily']);
  });
});
