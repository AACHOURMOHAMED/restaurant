import { buildApp } from './app';
import { loadConfig } from './config';
import { EventHub, Notifier, systemClock, type AppContext } from './context';
import { openDatabase } from './db';
import { countUsers, createUser } from './services/auth';
import { anonymizeOldReservations } from './services/reservations';

async function main() {
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  const ctx: AppContext = {
    db,
    config,
    clock: systemClock(config.fakeNow),
    events: new EventHub(),
    notifier: new Notifier(config.webhookUrl, console),
  };

  const app = await buildApp(ctx);
  ctx.notifier = new Notifier(config.webhookUrl, app.log);

  if (countUsers(db) === 0) {
    if (config.admin) {
      await createUser(db, { ...config.admin, role: 'admin' }, new Date());
      app.log.info(`Created administrator account ${config.admin.email}`);
    } else {
      app.log.warn('No staff account exists yet. Create one with: npm run create-admin');
    }
  }

  if (config.retentionDays > 0) {
    const purge = () => {
      const n = anonymizeOldReservations(ctx, config.retentionDays);
      if (n > 0) app.log.info(`Erased personal data from ${n} old reservation(s)`);
    };
    purge();
    setInterval(purge, 6 * 3_600_000).unref();
  }

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
