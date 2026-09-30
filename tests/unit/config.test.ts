import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../server/config';

describe('server configuration', () => {
  it('treats empty .env values as "not set"', () => {
    const config = loadConfig({ PUBLIC_URL: '', NOTIFY_WEBHOOK_URL: '', RATE_LIMIT: '', ADMIN_EMAIL: '', PORT: '' });
    expect(config.publicUrl).toBeNull();
    expect(config.webhookUrl).toBeNull();
    expect(config.rateLimit).toBe(true);
    expect(config.admin).toBeNull();
    expect(config.port).toBe(3000);
  });

  it('normalises the public URL and secures cookies in production', () => {
    const config = loadConfig({ NODE_ENV: 'production', PUBLIC_URL: 'https://www.bandbpark.ma/' });
    expect(config.publicUrl).toBe('https://www.bandbpark.ma');
    expect(config.cookieSecure).toBe(true);
    expect(loadConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'false' }).cookieSecure).toBe(false);
  });

  it('rejects invalid values with a readable message', () => {
    expect(() => loadConfig({ PUBLIC_URL: 'not a url' })).toThrow(/PUBLIC_URL/);
  });

  it('never fakes the clock in production', () => {
    expect(loadConfig({ NODE_ENV: 'production', FAKE_NOW: '2026-01-01T00:00:00Z' }).fakeNow).toBeNull();
  });

  it('refuses TRUST_PROXY=true, which would let visitors fake their address', () => {
    expect(() => loadConfig({ TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
  });

  it('TRUST_PROXY=<n> believes n proxies, the nearest one on this machine or a private network', () => {
    const trust = loadConfig({ TRUST_PROXY: '1' }).trustProxy as (address: string, hop: number) => boolean;
    expect(trust('127.0.0.1', 0)).toBe(true); // Caddy/nginx on the same machine
    expect(trust('::ffff:172.18.0.1', 0)).toBe(true); // Docker host
    expect(trust('203.0.113.9', 0)).toBe(false); // a visitor connecting directly can't pick their address
    expect(trust('127.0.0.1', 1)).toBe(false); // only one proxy
    const two = loadConfig({ TRUST_PROXY: '2' }).trustProxy as (address: string, hop: number) => boolean;
    expect(two('198.51.100.7', 1)).toBe(true); // e.g. Cloudflare in front of Caddy
    expect(loadConfig({ TRUST_PROXY: '10.0.0.5' }).trustProxy).toBe('10.0.0.5');
  });

  it('on Vercel, believes exactly the Vercel proxy', () => {
    const trust = loadConfig({ VERCEL: '1', DATABASE_URL: 'postgres://u:p@db.example/x' }).trustProxy as (a: string, h: number) => boolean;
    expect(trust('127.0.0.1', 0)).toBe(true);
    expect(trust('127.0.0.1', 1)).toBe(false);
  });

  it('uses HTTPS-only cookies whenever the public address is https', () => {
    expect(loadConfig({ PUBLIC_URL: 'https://www.bandbpark.ma' }).cookieSecure).toBe(true);
    expect(loadConfig({ PUBLIC_URL: 'http://192.168.1.20:3000' }).cookieSecure).toBe(false);
  });
});
