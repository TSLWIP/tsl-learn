import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Release guards that run against the built copy in dist/ (skipped when it has not been built, required in CI
 * and by `npm run check-dist`). They catch the mistakes that only show up once the site is under a subpath
 * on a static host: absolute URLs, an un-stamped service worker, a stray clip, a CDN reference.
 */
const dist = 'dist';
const have = existsSync(join(dist, 'index.html'));
const required = process.env.REQUIRE_DIST === '1';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const rel = (p: string) => p.slice(dist.length + 1).split('\\').join('/');

describe.skipIf(!have && !required)('built copy (dist/)', () => {
  it('exists', () => {
    expect(have, 'run `npx vite build` first').toBe(true);
  });
  if (!have) return;

  const files = walk(dist).map(rel);
  const html = readFileSync(join(dist, 'index.html'), 'utf8');

  it('uses only relative URLs, so it works under /<repo>/ on GitHub Pages', () => {
    expect(html.match(/(?:src|href)="\/(?!\/)/g) ?? []).toEqual([]);
    for (const f of files.filter((f) => /\.(js|css)$/.test(f))) {
      const text = readFileSync(join(dist, f), 'utf8');
      expect(text.match(/url\(\s*["']?\/(?!\/)/g) ?? [], `${f} has root-relative url()`).toEqual([]);
    }
    const manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8'));
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
  });

  it('loads nothing from a CDN or any other host', () => {
    expect(html.match(/<(?:script|link)[^>]+(?:src|href)="https?:/g) ?? []).toEqual([]);
    for (const f of files.filter((f) => /\.(js|css)$/.test(f))) {
      const text = readFileSync(join(dist, f), 'utf8');
      expect(text.match(/@import\s+url\(\s*["']?https?:/g) ?? [], `${f} imports remote CSS`).toEqual([]);
    }
  });

  it('has a stamped service worker whose precache list is real', () => {
    const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
    expect(sw).not.toContain('__BUILD_VERSION__');
    expect(sw).not.toContain('__PRECACHE__');
    expect(sw.match(/const VERSION = '([0-9a-f]{10})'/), 'version is a build hash').toBeTruthy();
    const list: string[] = JSON.parse(sw.match(/const PRECACHE = (\[.*?\]);/)![1]);
    expect(list).toContain('./');
    expect(list).toContain('index.html');
    for (const f of list.filter((f) => f !== './')) expect(files, `precached ${f} exists`).toContain(f);
    expect(list.filter((f) => f.startsWith('data/') || f.startsWith('clips/')), 'data and clips are not part of the shell').toEqual([]);
  });

  it('declares icons that exist', () => {
    const manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8'));
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    for (const i of manifest.icons) expect(files).toContain(i.src);
    expect(files).toContain('icons/apple-touch-icon.png');
  });

  it('ships no clips, but a consistent sign list and manifest', () => {
    expect(files.filter((f) => f.endsWith('.mp4')), 'no video files in the site').toEqual([]);
    expect(files.some((f) => f.startsWith('clips/'))).toBe(false);
    const lex = JSON.parse(readFileSync(join(dist, 'data/lexicon.json'), 'utf8'));
    const man = JSON.parse(readFileSync(join(dist, 'data/manifest.json'), 'utf8'));
    expect(man.buildId).toBe(lex.buildId);
    expect(man.clips.length).toBe(lex.entries.length);
    const ids = new Set<string>();
    for (const e of lex.entries) {
      expect(ids.has(e.id), `duplicate id ${e.id}`).toBe(false);
      ids.add(e.id);
    }
    expect(new Set(man.clips.map((c: { video: string }) => c.video))).toEqual(new Set(lex.entries.map((e: { video: string }) => e.video)));
    expect(man.clips.every((c: { size: number }) => c.size > 0)).toBe(true);
  });

  it('has a drawing file for every drawing the pictures list points to, and only real signs', () => {
    const pics = JSON.parse(readFileSync(join(dist, 'data/pictures.json'), 'utf8'));
    const lex = JSON.parse(readFileSync(join(dist, 'data/lexicon.json'), 'utf8'));
    const ids = new Set<string>(lex.entries.map((e: { id: string }) => e.id));
    expect(pics.schemaVersion).toBe(1);
    for (const table of [pics.hands, pics.places] as Record<string, { file?: string }>[]) {
      for (const [n, info] of Object.entries(table)) {
        if (info.file) {
          expect(files, `drawing ${n}: ${info.file}`).toContain(info.file);
          expect(info.file, 'relative path').not.toMatch(/^(\/|https?:)/);
        }
      }
    }
    for (const [id, s] of Object.entries(pics.signs) as [string, { h?: [string, number, number][]; p?: string[] }][]) {
      expect(ids.has(id), `pictures for unknown sign ${id}`).toBe(true);
      for (const [n] of s.h ?? []) expect(pics.hands[n], `hand ${n} of ${id}`).toBeTruthy();
      for (const n of s.p ?? []) expect(pics.places[n], `place ${n} of ${id}`).toBeTruthy();
    }
    // the drawings are part of the offline shell, so they work without a connection after the first visit
    const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
    const list: string[] = JSON.parse(sw.match(/const PRECACHE = (\[.*?\]);/)![1]);
    expect(list.filter((f) => f.startsWith('pictures/')).length).toBeGreaterThan(50);
  });

  it('keeps the app shell small', () => {
    const shell = files.filter((f) => f.startsWith('assets/')).reduce((a, f) => a + statSync(join(dist, f)).size, 0);
    expect(shell, `JS+CSS is ${(shell / 1024).toFixed(0)} KB`).toBeLessThan(400 * 1024);
  });
});
