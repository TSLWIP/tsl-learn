import preact from '@preact/preset-vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n: string) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Stamps public/sw.js with a build-specific version and the list of shell files to precache. */
function serviceWorkerVersion(): Plugin {
  let outDir = 'dist';
  return {
    name: 'sw-version',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split('\\').join('/'))
        // Data is fetched network-first at runtime, clips live in IndexedDB; neither is part of the shell.
        .filter((f) => f !== 'sw.js' && !f.startsWith('data/') && !f.startsWith('clips/') && f !== 'content-source.json');
      const hash = createHash('sha1');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 10);
      const swPath = join(outDir, 'sw.js');
      const src = readFileSync(swPath, 'utf8')
        .replace('__BUILD_VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(['./', ...files]));
      writeFileSync(swPath, src);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), serviceWorkerVersion()],
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0') },
  test: { include: ["tests/**/*.test.{ts,tsx}"], environment: 'node' },
});
