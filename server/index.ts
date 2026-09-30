import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from './app.js';
import { createContext, ensureAdmin } from './bootstrap.js';
import { ConfigError, loadConfig } from './config.js';
import { Notifier } from './context.js';
import { housekeeping } from './routes/cron.js';

async function main() {
  const config = loadConfig();
  const ctx = await createContext(config);
  const app = await buildApp(ctx);
  ctx.notifier = new Notifier(config.webhookUrl, app.log);

  await ensureAdmin(ctx, app.log);
  if (fs.existsSync(path.join(config.dataDir, 'restaurant.db'))) {
    app.log.warn(
      `${config.dataDir}/restaurant.db is a database of the previous (SQLite) version. This version uses PostgreSQL and does not read it.`,
    );
  }

  // Retention purge and cleanup of expired sessions (on Vercel, a cron job calls /api/cron/daily instead).
  const tidy = () =>
    housekeeping(ctx).then(
      ({ erased }) => erased > 0 && app.log.info(`Erased personal data from ${erased} old reservation(s)`),
      (err: unknown) => app.log.error({ err }, 'housekeeping failed'),
    );
  void tidy();
  setInterval(() => void tidy(), 6 * 3_600_000).unref();

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    await ctx.db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((err: unknown) => {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
});
