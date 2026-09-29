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
});
