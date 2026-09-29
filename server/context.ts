import type { StaffEvent } from '../shared/api-types';
import type { AppConfig } from './config';
import type { DB } from './db';

export type Clock = { now(): Date };

/** Fan-out of live events to connected staff dashboards (Server-Sent Events). */
export class EventHub {
  private listeners = new Set<(event: StaffEvent) => void>();

  subscribe(listener: (event: StaffEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: StaffEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A broken connection must not affect the others.
      }
    }
  }

  get size() {
    return this.listeners.size;
  }
}

/**
 * Optional outbound webhook (Slack, Zapier, Make, n8n…) for new reservations
 * and orders. Payloads never contain guests' contact details.
 */
type WarnLogger = { warn(obj: unknown, msg?: string): void };

export class Notifier {
  constructor(
    private readonly url: string | null,
    private readonly log: WarnLogger,
  ) {}

  send(type: string, data: Record<string, unknown>): void {
    if (!this.url) return;
    const body = JSON.stringify({ type, data, sentAt: new Date().toISOString() });
    fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: AbortSignal.timeout(5000),
    }).catch((err: unknown) => this.log.warn({ err }, 'webhook notification failed'));
  }
}

export type AppContext = {
  db: DB;
  config: AppConfig;
  clock: Clock;
  events: EventHub;
  notifier: Notifier;
};

export function systemClock(fakeNow: Date | null): Clock {
  if (!fakeNow) return { now: () => new Date() };
  // Fake time still moves forward, starting at the configured instant.
  const offset = fakeNow.getTime() - Date.now();
  return { now: () => new Date(Date.now() + offset) };
}
