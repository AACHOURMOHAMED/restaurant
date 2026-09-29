/**
 * Maintenance commands.
 *
 *   npm run cli -- seed --demo          Load the sample menu + 12 sample tables (previews/tests)
 *   npm run create-admin                Create an administrator (interactive)
 *   npm run cli -- create-admin --email a@b.c --name "Nom" [--password …]
 *   npm run cli -- reset-password --email a@b.c
 *   npm run cli -- remove-demo-menu
 *   npm run cli -- purge --days 180     Erase personal data of reservations older than N days
 *   npm run cli -- backup [--out file]  Consistent copy of the database (safe while the site runs)
 *
 * In production (after `npm run build`) use `node dist/server/cli.js <command>`.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { passwordSchema, staffUserCreateSchema } from '../shared/schemas';
import { loadConfig } from './config';
import { EventHub, Notifier, systemClock } from './context';
import { openDatabase } from './db';
import { deleteDemoMenu } from './repos/menu';
import { getFlag } from './repos/settings';
import { createUser, updateUser } from './services/auth';
import { anonymizeOldReservations } from './services/reservations';
import { seedDemoMenu, seedDemoTables } from './seed/demo';

const VALUE_FLAGS = new Set(['email', 'name', 'password', 'days', 'out']);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function positionals(): string[] {
  const args = process.argv.slice(2);
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      if (VALUE_FLAGS.has(a.slice(2))) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

async function ask(question: string, hidden = false): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
    muted = hidden;
  });
}

async function main() {
  const [command] = positionals();
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  const now = new Date();

  switch (command) {
    case 'seed': {
      if (!process.argv.includes('--demo')) {
        console.log('Database ready at', config.databasePath);
        console.log('Add --demo to load the sample menu and sample tables.');
        break;
      }
      if (getFlag(db, 'demo_menu')) console.log('Sample menu already loaded — skipping menu.');
      else seedDemoMenu(db, now);
      seedDemoTables(db, now);
      console.log('Sample menu and tables loaded. Remove the sample menu later from the dashboard.');
      break;
    }
    case 'create-admin': {
      const email = arg('email') ?? (await ask('E-mail: '));
      const name = arg('name') ?? (await ask('Nom / Name: '));
      const password = arg('password') ?? process.env.ADMIN_PASSWORD ?? (await ask('Mot de passe (10+ caractères): ', true));
      const input = staffUserCreateSchema.parse({ email, name, password, role: 'admin' });
      const user = await createUser(db, input, now);
      console.log(`Administrator created: ${user.email}`);
      break;
    }
    case 'reset-password': {
      const email = (arg('email') ?? (await ask('E-mail: '))).toLowerCase();
      const row = db.prepare('SELECT id FROM staff_users WHERE email = ?').get(email) as { id: number } | undefined;
      if (!row) throw new Error(`No account for ${email}`);
      const password = passwordSchema.parse(arg('password') ?? (await ask('Nouveau mot de passe: ', true)));
      await updateUser(db, row.id, { password }, -1);
      console.log('Password updated; existing sessions were signed out.');
      break;
    }
    case 'remove-demo-menu': {
      deleteDemoMenu(db);
      console.log('Sample menu removed.');
      break;
    }
    case 'purge': {
      const days = Number(arg('days'));
      if (!Number.isInteger(days) || days <= 0) throw new Error('Usage: purge --days <N>');
      const ctx = { db, config, clock: systemClock(null), events: new EventHub(), notifier: new Notifier(null, console) };
      console.log(`Erased personal data from ${anonymizeOldReservations(ctx, days)} reservation(s).`);
      break;
    }
    case 'backup': {
      const stamp = now.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
      const out = path.resolve(arg('out') ?? path.join(config.dataDir, 'backups', `restaurant-${stamp}.db`));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await db.backup(out);
      console.log(`Database copied to ${out}`);
      console.log(`Dish photos are in ${config.uploadsDir} — back that folder up too.`);
      break;
    }
    default:
      console.log('Commands: seed [--demo] | create-admin | reset-password | remove-demo-menu | purge --days N | backup [--out file]');
      process.exitCode = command ? 1 : 0;
  }
  db.close();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
