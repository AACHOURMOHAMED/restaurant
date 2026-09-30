/**
 * Starts a throw-away server for the end-to-end tests: fresh database with the
 * sample menu, 12 tables and an admin account, ordering allowed at any hour so
 * the suite passes whatever the time of day.
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase } from '../../server/db';
import { setOrderingSettings } from '../../server/repos/settings';
import { seedDemoMenu, seedDemoTables } from '../../server/seed/demo';

export const E2E_PORT = 4310;
const dir = path.resolve('tests/.tmp/e2e');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

// Same folder the server uses (DATA_DIR/pgdata); closed again before the server starts.
const db = await openDatabase({ dir: path.join(dir, 'pgdata') });
await seedDemoMenu(db);
await seedDemoTables(db);
await setOrderingSettings(db, { enabled: true, onlyDuringOpeningHours: false });
await db.close();

if (process.env.E2E_SKIP_BUILD !== '1') execSync('npx vite build', { stdio: 'inherit' });

const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    DATA_DIR: dir,
    PORT: String(E2E_PORT),
    HOST: '127.0.0.1',
    RATE_LIMIT: 'off',
    LOG_LEVEL: 'warn',
    ADMIN_EMAIL: 'e2e@bandbpark.test',
    ADMIN_PASSWORD: 'e2e-password-123',
    ADMIN_NAME: 'Équipe E2E',
  },
});
const stop = () => child.kill('SIGTERM');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', stop);
child.on('exit', (code) => process.exit(code ?? 0));
