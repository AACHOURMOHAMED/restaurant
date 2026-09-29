/**
 * Maintenance commands.
 *
 *   npm run cli -- seed --demo          Load the sample menu + 12 sample tables (previews/tests)
 *   npm run create-admin                Create an administrator (interactive)
 *   npm run cli -- create-admin --email a@b.c --name "Nom" [--password …]
 *   npm run cli -- reset-password --email a@b.c
 *   npm run cli -- demo-photos         Attach sample dish photos (content/photos/menu/) to the sample menu
 *   npm run cli -- remove-demo-menu
 *   npm run cli -- purge --days 180     Erase personal data of reservations older than N days
 *   npm run cli -- backup [--out file]  Copy of the embedded database (stop the server first)
 *   npm run cli -- restore --file F     Recreate the embedded database from a backup (into an empty data folder)
 *
 * In production (after `npm run build`) use `node dist/server/cli.js <command>`.
 * With DATABASE_URL set, commands work on that PostgreSQL database (e.g. the one of a Vercel
 * deployment, after `vercel env pull`), and dish photos go to Vercel Blob if BLOB_READ_WRITE_TOKEN is set.
 */
import path from 'node:path';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { passwordSchema, staffUserCreateSchema } from '../shared/schemas.js';
import { createContext } from './bootstrap.js';
import { loadConfig } from './config.js';
import { restoreEmbedded } from './db.js';
import { deleteDemoMenu } from './repos/menu.js';
import { getFlag } from './repos/settings.js';
import { createUser, updateUser } from './services/auth.js';
import { deleteMenuImage } from './services/images.js';
import { anonymizeOldReservations } from './services/reservations.js';
import { attachDemoPhotos, seedDemoMenu, seedDemoTables } from './seed/demo.js';

const VALUE_FLAGS = new Set(['email', 'name', 'password', 'days', 'out', 'file']);

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
  if (command === 'restore') {
    const file = arg('file');
    if (!file) throw new Error('Usage: restore --file <backup.tar.gz>');
    if (typeof config.database !== 'object' || !('dir' in config.database)) {
      throw new Error("restore is for the embedded database. With DATABASE_URL, use your provider's restore (Neon: restore from history) or pg_restore.");
    }
    await restoreEmbedded(config.database.dir, path.resolve(file));
    console.log(`Database restored into ${config.database.dir}`);
    return;
  }
  const ctx = await createContext(config);
  const { db, media } = ctx;
  const now = new Date();
  const target = config.database;
  const where = typeof target === 'string' ? 'in memory' : 'url' in target ? `PostgreSQL (${new URL(target.url).host})` : target.dir;

  switch (command) {
    case 'seed': {
      if (!process.argv.includes('--demo')) {
        console.log('Database ready:', where);
        console.log('Add --demo to load the sample menu and sample tables.');
        break;
      }
      if (await getFlag(db, 'demo_menu')) console.log('Sample menu already loaded — skipping menu.');
      else await seedDemoMenu(db, now);
      await seedDemoTables(db, now);
      const photos = media ? await attachDemoPhotos(db, media) : 0;
      if (photos > 0) console.log(`Sample dish photos attached: ${photos}`);
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
      const row = await db.one<{ id: number }>('SELECT id FROM staff_users WHERE email = ?', [email]);
      if (!row) throw new Error(`No account for ${email}`);
      const password = passwordSchema.parse(arg('password') ?? (await ask('Nouveau mot de passe: ', true)));
      await updateUser(db, row.id, { password }, -1);
      console.log('Password updated; existing sessions were signed out.');
      break;
    }
    case 'demo-photos': {
      if (!media) throw new Error('No photo storage: set BLOB_READ_WRITE_TOKEN (Vercel Blob).');
      console.log(`Sample dish photos attached: ${await attachDemoPhotos(db, media)}`);
      break;
    }
    case 'remove-demo-menu': {
      const images = await deleteDemoMenu(db);
      if (media) await Promise.all(images.map((image) => deleteMenuImage(image, media)));
      console.log('Sample menu removed.');
      break;
    }
    case 'purge': {
      const days = Number(arg('days'));
      if (!Number.isInteger(days) || days <= 0) throw new Error('Usage: purge --days <N>');
      console.log(`Erased personal data from ${await anonymizeOldReservations(ctx, days)} reservation(s).`);
      break;
    }
    case 'backup': {
      if (!db.backup) {
        console.log(`The database is ${where}: back it up with pg_dump, or with your provider's backups (Neon keeps a restore history).`);
        break;
      }
      const stamp = now.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
      const out = path.resolve(arg('out') ?? path.join(config.dataDir, 'backups', `restaurant-${stamp}.tar.gz`));
      await db.backup(out);
      console.log(`Database copied to ${out}`);
      if (media?.defaultBase === '/uploads') console.log(`Dish photos are in ${config.uploadsDir} — back that folder up too.`);
      break;
    }
    default:
      console.log(
        'Commands: seed [--demo] | create-admin | reset-password | demo-photos | remove-demo-menu | purge --days N | backup [--out file] | restore --file F',
      );
      process.exitCode = command ? 1 : 0;
  }
  await db.close();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
