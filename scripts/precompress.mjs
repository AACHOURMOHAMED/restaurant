// Writes .br and .gz versions of the built site's text assets so the server can
// send them compressed without spending CPU on every request.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve('dist/client');
const COMPRESSIBLE = /\.(js|mjs|css|html|svg|json|webmanifest|txt|xml)$/;
let files = 0;
let saved = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (COMPRESSIBLE.test(entry.name) && !entry.name.endsWith('.map')) {
      const data = fs.readFileSync(full);
      if (data.length < 1024) continue;
      const br = zlib.brotliCompressSync(data, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length },
      });
      const gz = zlib.gzipSync(data, { level: 9 });
      fs.writeFileSync(`${full}.br`, br);
      fs.writeFileSync(`${full}.gz`, gz);
      files++;
      saved += data.length - br.length;
    }
  }
}

if (!fs.existsSync(root)) throw new Error('dist/client not found — run vite build first');
walk(root);
console.log(`precompress: ${files} files, ${(saved / 1024).toFixed(0)} KB saved with brotli`);
