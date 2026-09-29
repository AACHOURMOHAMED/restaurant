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
});
