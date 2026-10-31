// Builds public/pictures/{hand,place}/<number>.jpg and public/data/pictures.json from the legacy E:\TSL data.
// usage: node scripts/build-pictures.ts [--legacy E:/TSL/data] [--ffmpeg ffmpeg]
//
// Every drawing is identified by the number at the start of its dictionary code ("209_雞" -> 209, "602_palm" -> 602),
// so file names are plain ASCII. A replacement drawing is any file named <number>.(png|jpg|jpeg|webp|svg) in
// public/pictures/custom/hand/ or public/pictures/custom/place/; it wins over the dictionary drawing and is never
// overwritten by this script. See docs/PICTURES.md.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PictureKind, Pictures } from '../src/pictures/types.ts';

const CUSTOM_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];

interface LegacyEntry {
  handshapes?: { hand: number; locationSlot: number; code: string }[];
  locations?: string[];
}

/** "209_雞" -> "209"; "101_一b" -> "101"; null when the code has no leading number. */
export function pictureNumber(code: string): string | null {
  return /^\d+/.exec(code.trim())?.[0] ?? null;
}

/** The readable part of a code: "209_雞" -> "雞", "401_in_front_of_body" -> "in front of body". */
export function pictureLabel(code: string): string {
  return code
    .trim()
    .replace(/^\d+_?/, '')
    .replace(/(?<=[㐀-鿿])[a-z]$/i, '') // variant suffix: "101_一b" is the same drawing as "101_一"
    .replace(/_/g, ' ')
    .trim();
}

export function buildPictureData(
  legacyEntries: Record<string, LegacyEntry>,
  knownIds: ReadonlySet<string>,
  files: { hand: Map<string, string>; place: Map<string, string> },
): Pictures {
  const out: Pictures = { schemaVersion: 1, hands: {}, places: {}, signs: {} };
  const use = (kind: PictureKind, code: string): string | null => {
    const n = pictureNumber(code);
    if (!n) return null;
    const table = kind === 'hand' ? out.hands : out.places;
    const label = pictureLabel(code);
    const file = files[kind].get(n);
    const have = table[n];
    if (!have) table[n] = { label: label || n, ...(file ? { file } : {}) };
    // the first readable label for a number wins ("101_一" and "101_一b" are the same drawing)
    else if (!have.label && label) have.label = label;
    return n;
  };

  for (const [id, e] of Object.entries(legacyEntries)) {
    if (!knownIds.has(id)) continue;
    const h: [string, number, number][] = [];
    for (const s of e.handshapes ?? []) {
      const n = use('hand', s.code);
      if (n && !h.some((x) => x[0] === n && x[1] === s.hand)) h.push([n, s.hand, s.locationSlot]);
    }
    const p: string[] = [];
    for (const code of e.locations ?? []) {
      const n = use('place', code);
      if (n && !p.includes(n)) p.push(n);
    }
    if (h.length || p.length) out.signs[id] = { ...(h.length ? { h } : {}), ...(p.length ? { p } : {}) };
  }
  return out;
}

/** number -> file name of a custom replacement, for every <number>.<ext> found in dir */
export function customFiles(dir: string): Map<string, string> {
  const m = new Map<string, string>();
  if (!existsSync(dir)) return m;
  for (const f of readdirSync(dir)) {
    const ext = extname(f).toLowerCase();
    const stem = f.slice(0, f.length - ext.length);
    if (CUSTOM_EXT.includes(ext) && /^\d+$/.test(stem)) m.set(stem, f);
  }
  return m;
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name: string, dflt: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
  const legacy = resolve(opt('--legacy', 'E:/TSL/data'));
  const ffmpeg = opt('--ffmpeg', 'ffmpeg');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const pub = join(root, 'public');

  const lex = JSON.parse(readFileSync(join(legacy, 'compiled/lexicon.json'), 'utf8')).headwords as Record<string, LegacyEntry>;
  const ours = new Set<string>((JSON.parse(readFileSync(join(pub, 'data/lexicon.json'), 'utf8')).entries as { id: string }[]).map((e) => e.id));

  // 1. source drawings by number
  const handSrc = join(legacy, 'source/handshape-images');
  const placeSrc = join(legacy, 'source/location-images');
  const srcByNumber = (dir: string) => {
    const m = new Map<string, string>();
    for (const f of readdirSync(dir)) {
      const n = /^(\d+)_/.exec(f)?.[1];
      if (!n || !/\.(jpe?g|png)$/i.test(f)) continue;
      if (m.has(n)) throw new Error(`two drawings share the number ${n} in ${dir}: ${m.get(n)} and ${f}`);
      m.set(n, f);
    }
    return m;
  };
  const handFiles = srcByNumber(handSrc);
  const placeFiles = srcByNumber(placeSrc);

  // 2. write the (shrunk) dictionary drawings
  const tmp = mkdtempSync(join(tmpdir(), 'tsl-pics-'));
  const handOut = join(pub, 'pictures/hand');
  const placeOut = join(pub, 'pictures/place');
  mkdirSync(handOut, { recursive: true });
  mkdirSync(placeOut, { recursive: true });
  let bytes = 0;
  try {
    for (const [n, f] of handFiles) {
      // ffmpeg is given plain ASCII paths (a copy in the temp folder): Chinese file names are not safe on every shell
      const inp = join(tmp, 'in' + extname(f));
      copyFileSync(join(handSrc, f), inp);
      const out = join(handOut, `${n}.jpg`);
      execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', inp, '-vf', "scale='min(480,iw)':-2", '-q:v', '4', out]);
      bytes += statSync(out).size;
    }
    for (const [n, f] of placeFiles) {
      const out = join(placeOut, `${n}.jpg`);
      if (extname(f).toLowerCase() === '.png') {
        const inp = join(tmp, 'in.png');
        copyFileSync(join(placeSrc, f), inp);
        execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', inp, '-q:v', '4', out]);
      } else copyFileSync(join(placeSrc, f), out);
      bytes += statSync(out).size;
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // 3. the data file: custom replacements win over the dictionary drawings
  const customHand = customFiles(join(pub, 'pictures/custom/hand'));
  const customPlace = customFiles(join(pub, 'pictures/custom/place'));
  const pathOf = (kind: PictureKind, n: string, orig: Map<string, string>, custom: Map<string, string>) =>
    custom.has(n) ? `pictures/custom/${kind}/${custom.get(n)}` : orig.has(n) ? `pictures/${kind}/${n}.jpg` : undefined;
  const handPaths = new Map<string, string>();
  const placePaths = new Map<string, string>();
  const data = buildPictureData(lex, ours, { hand: handPaths, place: placePaths });
  // second pass now that we know which numbers are used: attach paths (custom or dictionary)
  for (const [n, h] of Object.entries(data.hands)) {
    const p = pathOf('hand', n, handFiles, customHand);
    if (p) h.file = p;
    if (customHand.has(n)) h.custom = true;
  }
  for (const [n, h] of Object.entries(data.places)) {
    const p = pathOf('place', n, placeFiles, customPlace);
    if (p) h.file = p;
    if (customPlace.has(n)) h.custom = true;
  }
  // a custom drawing for a number nobody uses yet is still useful once a sign adopts it: report it, do not drop it
  for (const [kind, custom, table] of [['hand', customHand, data.hands], ['place', customPlace, data.places]] as const) {
    for (const n of custom.keys()) if (!table[n]) console.warn(`custom ${kind} drawing ${n} is not used by any sign`);
  }

  writeFileSync(join(pub, 'data/pictures.json'), JSON.stringify(data));
  const withH = Object.values(data.signs).filter((s) => s.h).length;
  const withP = Object.values(data.signs).filter((s) => s.p).length;
  const noFileH = Object.entries(data.hands).filter(([, v]) => !v.file).map(([n]) => n);
  console.log(
    `${handFiles.size} hand + ${placeFiles.size} place drawings (${(bytes / 1e6).toFixed(1)} MB); ` +
      `${withH} signs have hand shapes, ${withP} have locations; ` +
      `${customHand.size + customPlace.size} custom replacement(s)`,
  );
  if (noFileH.length) console.log(`hand shapes with no drawing yet: ${noFileH.join(', ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
