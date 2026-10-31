import type { LexEntry, Lexicon } from '../lexicon/types.ts';
import { editDistance, normalizeText } from './normalize.ts';

export interface Hit {
  entry: LexEntry;
  /** true when the gloss is the entry's primary English word */
  primary: boolean;
}

export interface MatchIndex {
  entries: LexEntry[];
  byId: Map<string, LexEntry>;
  /** normalised English gloss -> entries */
  byGloss: Map<string, Hit[]>;
  /** gloss with spaces removed -> normalised gloss ("goodbye" -> "good bye") */
  squashed: Map<string, string>;
  /** Chinese gloss -> entries */
  byZh: Map<string, LexEntry[]>;
  maxWords: number;
  maxZh: number;
  /** single-word glosses, for typo suggestions */
  singleWords: string[];
}

export function buildIndex(lexicon: Pick<Lexicon, 'entries'>): MatchIndex {
  const byGloss = new Map<string, Hit[]>();
  const byZh = new Map<string, LexEntry[]>();
  const squashed = new Map<string, string>();
  const byId = new Map<string, LexEntry>();
  let maxWords = 1;
  let maxZh = 1;
  for (const entry of lexicon.entries) {
    byId.set(entry.id, entry);
    entry.english.forEach((g, i) => {
      const key = normalizeText(g);
      if (!key) return;
      const list = byGloss.get(key) ?? [];
      if (!list.some((h) => h.entry === entry)) list.push({ entry, primary: i === 0 });
      byGloss.set(key, list);
      maxWords = Math.max(maxWords, key.split(' ').length);
      if (key.includes(' ')) squashed.set(key.replaceAll(' ', ''), key);
    });
    if (entry.chinese) {
      const list = byZh.get(entry.chinese) ?? [];
      list.push(entry);
      byZh.set(entry.chinese, list);
      maxZh = Math.max(maxZh, [...entry.chinese].length);
    }
  }
  const singleWords = [...byGloss.keys()].filter((k) => !k.includes(' ') && /^[a-z']+$/.test(k));
  return { entries: lexicon.entries, byId, byGloss, squashed, byZh, maxWords, maxZh, singleWords };
}

/** Entries that share this entry's primary English gloss: its dialect and free variants. */
export function siblings(index: MatchIndex, entry: LexEntry): LexEntry[] {
  const hits = index.byGloss.get(normalizeText(entry.english[0] ?? '')) ?? [];
  const list = hits.filter((h) => h.primary).map((h) => h.entry);
  return list.length ? list : [entry];
}

export interface TypeaheadItem {
  label: string;
  chinese: string | null;
  entryId: string;
}

/** Instant suggestions while typing: prefix matches first, then word-start matches. Chinese works too. */
export function typeahead(index: MatchIndex, query: string, limit = 6): TypeaheadItem[] {
  const q = normalizeText(query);
  const zh = query.trim();
  if (!q && !zh) return [];
  const scored: { score: number; entry: LexEntry; label: string }[] = [];
  const seen = new Set<string>();
  for (const e of index.entries) {
    let best = 0;
    let label = e.english[0] ?? '';
    e.english.forEach((g, i) => {
      const k = normalizeText(g);
      let s = 0;
      if (k === q) s = 100;
      else if (k.startsWith(q)) s = 80;
      else if (k.split(' ').some((w) => w.startsWith(q))) s = 50;
      if (s && i > 0) s -= 15;
      if (s > best) {
        best = s;
        label = g;
      }
    });
    if (e.chinese && zh && e.chinese.startsWith(zh)) best = Math.max(best, 90);
    if (best > 0 && q.length >= 1) {
      const key = `${normalizeText(label)}|${e.chinese}`;
      if (seen.has(key)) continue; // show one row per word, not one per variant
      seen.add(key);
      scored.push({ score: best, entry: e, label });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.label.length - b.label.length || a.label.localeCompare(b.label));
  return scored.slice(0, limit).map((s) => ({ label: s.label, chinese: s.entry.chinese, entryId: s.entry.id }));
}

/** Library search: ranked, forgiving of one typo for longer words. */
export function searchEntries(index: MatchIndex, query: string, pool: LexEntry[] = index.entries): LexEntry[] {
  const q = normalizeText(query);
  const zh = query.trim();
  if (!q && !zh) return pool;
  const scored: [number, LexEntry][] = [];
  for (const e of pool) {
    let best = 0;
    e.english.forEach((g, i) => {
      const k = normalizeText(g);
      const penalty = i === 0 ? 0 : 12;
      let s = 0;
      if (k === q) s = 100;
      else if (k.startsWith(q)) s = 80;
      else if (k.split(' ').some((w) => w.startsWith(q))) s = 60;
      else if (q.length >= 3 && k.includes(q)) s = 40;
      else if (q.length >= 4 && !k.includes(' ') && editDistance(k, q, 1) <= 1) s = 30;
      if (s) best = Math.max(best, s - penalty);
    });
    if (e.chinese && zh) {
      if (e.chinese === zh) best = Math.max(best, 100);
      else if (e.chinese.includes(zh)) best = Math.max(best, 70);
    }
    if (best) scored.push([best, e]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].english[0].length - b[1].english[0].length);
  return scored.map((s) => s[1]);
}
