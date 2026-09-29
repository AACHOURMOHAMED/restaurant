import { describe, expect, it } from 'vitest';
import { redactUrl } from '../../server/app';
import { phoneDigits, WindowCounter } from '../../server/lib/util';

describe('access logs', () => {
  it("hide guests' status-link tokens, in API calls and in page URLs", () => {
    const token = 'Ab3_'.repeat(11);
    for (const url of [`/api/public/reservations/${token}`, `/api/public/orders/${token}`, `/reservation/${token}`, `/order/${token}?x=1`]) {
      expect(redactUrl(url), url).not.toContain(token);
    }
    expect(redactUrl('/order')).toBe('/order');
    expect(redactUrl('/t/AB12CD34')).toBe('/t/AB12CD34'); // table codes are not secrets
  });
});

describe('phone numbers', () => {
  it('compare equal whatever format the guest typed', () => {
    for (const phone of ['06 12 34 56 78', '0612345678', '+212 6 12 34 56 78', '00212612345678', '+212 6-12-34-56-78']) {
      expect(phoneDigits(phone), phone).toBe('0612345678');
    }
    expect(phoneDigits('+33 6 12 34 56 78')).toBe('33612345678'); // foreign numbers keep their country code
  });
});

describe('WindowCounter', () => {
  it('counts events per key over a sliding window', () => {
    const c = new WindowCounter(1000);
    c.add('a', 0);
    c.add('a', 500);
    c.add('b', 500);
    expect(c.count('a', 900)).toBe(2);
    expect(c.count('a', 1200)).toBe(1);
    expect(c.count('a', 2000)).toBe(0);
    expect(c.count('b', 900)).toBe(1);
  });
});
