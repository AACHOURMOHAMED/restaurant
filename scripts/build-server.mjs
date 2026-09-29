// Bundles the TypeScript server (and CLI) into plain ESM for `npm start`.
// node_modules stay external: install production dependencies next to dist/.
import { build } from 'esbuild';

await build({
  entryPoints: { index: 'server/index.ts', cli: 'server/cli.ts' },
  outdir: 'dist/server',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
  // The built server is what runs in production: default to it unless NODE_ENV says otherwise
  // (this turns on HTTPS-only cookies and HSTS). Runs before any of the bundled code.
  banner: { js: "process.env.NODE_ENV ??= 'production';" },
});
