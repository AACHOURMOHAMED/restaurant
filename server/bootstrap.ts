/** Start-up steps shared by the long-running server (index.ts) and the Vercel function (serverless.ts). */
import { staffUserCreateSchema } from '../shared/schemas.js';
import { ConfigError, type AppConfig } from './config.js';
import { EventHub, Notifier, systemClock, type AppContext } from './context.js';
import { openDatabase } from './db.js';
import { AppError } from './errors.js';
import { countUsers, createUser } from './services/auth.js';
import { mediaStoreFor } from './storage.js';

type Log = { info(msg: string): void; warn(msg: string): void };

export async function createContext(config: AppConfig): Promise<AppContext> {
  return {
    db: await openDatabase(config.database),
    config,
    media: mediaStoreFor(config),
    clock: systemClock(config.fakeNow),
    events: new EventHub(),
    notifier: new Notifier(config.webhookUrl, console),
  };
}

/** Creates the first administrator from ADMIN_EMAIL / ADMIN_PASSWORD while no staff account exists. */
export async function ensureAdmin(ctx: AppContext, log: Log): Promise<void> {
  const { config } = ctx;
  if ((await countUsers(ctx.db)) > 0) return;
  if (!config.admin) {
    log.warn(
      config.serverless
        ? 'No staff account exists yet. Set ADMIN_EMAIL and ADMIN_PASSWORD in the project settings (Environment Variables) and redeploy.'
        : 'No staff account exists yet. Create one with: npm run create-admin',
    );
    return;
  }
  // Same rules as accounts created in the dashboard (valid e-mail, 10+ character password).
  const admin = staffUserCreateSchema.safeParse({ ...config.admin, role: 'admin' });
  if (!admin.success) {
    const fields = admin.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new ConfigError(`ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME are not valid (${fields}). The password needs at least 10 characters.`);
  }
  try {
    await createUser(ctx.db, admin.data, new Date());
    log.info(`Created administrator account ${config.admin.email}`);
  } catch (err) {
    // Another server instance starting at the same moment created it first.
    if (!(err instanceof AppError && err.code === 'EMAIL_TAKEN')) throw err;
  }
}
