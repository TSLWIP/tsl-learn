// Builds public/data/lexicon.json + manifest.json from the legacy E:\TSL compiled lexicon.
// usage: node scripts/build-lexicon.ts [--src <lexicon.json>] [--clips <dir>] [--allow-issues]
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Dialect, LexCategory, LexEntry, Lexicon } from '../src/lexicon/types.ts';
import { normalizeGloss, validateLexicon } from '../src/lexicon/validate.ts';

const SOURCE_URL = 'https://twtsl.ccu.edu.tw/';
const LICENSE_NOTE =
  'Clip and gloss from the TSL Online Dictionary, National Chung Cheng University. Reuse terms not stated; see NOTICE.md.';

interface LegacyHeadword {
  key: string;
  word: string;
  videoPath: string;
  synonym1?: string | null;
  synonym2?: string | null;
  chinese?: string | null;
  dialect?: 'N' | 'S' | null;
  variant?: string | null;
  description?: string | null;
}

const MORE: LexCategory = { id: 'more', en: 'More signs', zh: '其他手語' };

export function senseSnippet(h: Pick<LegacyHeadword, 'variant' | 'description'>, n: number): string {
  if (h.variant) return `Variant ${String(h.variant).toUpperCase()}`;
  const d = (h.description ?? '').trim();
  if (d) return d.length > 48 ? `${d.slice(0, 45).trimEnd()}...` : d;
  return `Sign ${n}`;
}

export function convert(
  legacy: { headwords: Record<string, LegacyHeadword>; categories: (LexCategory & { words: string[] })[] },
  customSynonyms: Record<string, string[]>,
): { entries: LexEntry[]; categories: LexCategory[] } {
  const catOf = new Map<string, string>();
  for (const c of legacy.categories) for (const w of c.words) if (!catOf.has(w)) catOf.set(w, c.id);

  const entries: LexEntry[] = Object.values(legacy.headwords).map((h) => {
    const english: string[] = [];
    for (const g of [h.word, h.synonym1, h.synonym2, ...(customSynonyms[h.key] ?? [])]) {
      if (g && !english.some((x) => normalizeGloss(x) === normalizeGloss(g))) english.push(g.trim());
    }
    const dialect: Dialect = h.dialect === 'N' ? 'north' : h.dialect === 'S' ? 'south' : 'both';
    const description = (h.description ?? '').trim();
    return {
      id: h.key,
      chinese: h.chinese ? h.chinese.replace(/_[NSAB]$/i, '') : null,
      english,
      category: catOf.get(h.key) ?? MORE.id,
      dialect,
      ...(description ? { description: description.slice(0, 240) } : {}),
      video: h.videoPath.split(String.fromCharCode(92)).join('/'),
      sourceUrl: SOURCE_URL,
      licenseNote: LICENSE_NOTE,
    };
  });

  // Label signs that share a primary English gloss and are not already told apart by dialect.
  const groups = new Map<string, { e: LexEntry; h: LegacyHeadword }[]>();
  for (const e of entries) {
    const k = normalizeGloss(e.english[0] ?? '');
    if (!k) continue;
    const list = groups.get(k) ?? [];
    list.push({ e, h: legacy.headwords[e.id] });
    groups.set(k, list);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const perDialect = new Map<Dialect, number>();
    for (const { e } of group) perDialect.set(e.dialect, (perDialect.get(e.dialect) ?? 0) + 1);
    const used = new Map<string, number>();
    group.forEach(({ e, h }, i) => {
      if (e.dialect !== 'both' && perDialect.get(e.dialect) === 1) return;
      let label = senseSnippet(h, i + 1);
      const k = `${e.dialect}|${label}`;
      const n = (used.get(k) ?? 0) + 1;
      used.set(k, n);
      if (n > 1) label = `${label} (${n})`;
      e.senseLabel = label;
    });
  }

  const present = new Set(entries.map((e) => e.category));
  const categories = [...legacy.categories.map(({ id, en, zh }) => ({ id, en, zh })), MORE].filter((c) =>
    present.has(c.id),
  );
  return { entries, categories };
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name: string, dflt: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const src = resolve(opt('--src', 'E:/TSL/data/compiled/lexicon.json'));
  const clips = resolve(opt('--clips', 'E:/TSL/data/source/videos'));
  const custom = resolve(opt('--custom', 'E:/TSL/data/source/custom-synonyms.json'));
  const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data');

  const legacy = JSON.parse(readFileSync(src, 'utf8'));
  const customSynonyms = existsSync(custom) ? JSON.parse(readFileSync(custom, 'utf8')) : {};
  delete customSynonyms._comment;
  const { entries, categories } = convert(legacy, customSynonyms);

  // Zero-byte or missing clips are treated as missing.
  const sizeOf = (v: string) => {
    const p = join(clips, v);
    return existsSync(p) ? statSync(p).size : 0;
  };
  const issues = validateLexicon(entries, (v) => sizeOf(v) > 0);
  if (issues.length) {
    const byRule: Record<string, number> = {};
    for (const i of issues) byRule[i.rule] = (byRule[i.rule] ?? 0) + 1;
    console.error('Lexicon validation FAILED', byRule);
    for (const i of issues.slice(0, 15)) console.error(` - [${i.rule}] ${i.id}: ${i.message}`);
    if (!args.includes('--allow-issues')) process.exit(1);
  }

  const manifestClips = entries.map((e) => ({ video: e.video, size: sizeOf(e.video) }));
  const buildId = createHash('sha1')
    .update(JSON.stringify(entries))
    .update(JSON.stringify(manifestClips))
    .digest('hex')
    .slice(0, 12);
  const lexicon: Lexicon = { schemaVersion: 1, buildId, categories, entries };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'lexicon.json'), JSON.stringify(lexicon));
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ buildId, clips: manifestClips }));
  const total = manifestClips.reduce((a, c) => a + c.size, 0);
  console.log(`lexicon ${buildId}: ${entries.length} entries, ${(total / 1e6).toFixed(0)} MB of clips`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
