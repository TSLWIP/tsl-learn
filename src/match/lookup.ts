import type { Dialect, LexEntry } from '../lexicon/types.ts';
import { ALIASES, ARTICLES, COPULAS, NO_SYNONYM_FALLBACK, NUMBER_WORDS, RELATED, SKIPPED_REASON } from './data.ts';
import { siblings, type Hit, type MatchIndex } from './index.ts';
import { editDistance, normalizeText, splitScripts, stems } from './normalize.ts';

const ALIAS_MAX_WORDS = Math.max(...Object.keys(ALIASES).map((k) => k.split(' ').length));

export type Via = 'exact' | 'inflection' | 'alias' | 'joined' | 'synonym' | 'number' | 'chinese';

export interface Suggestion {
  entryId: string;
  label: string;
  chinese: string | null;
  why: 'related' | 'typo' | 'contains' | 'digit';
}

export type LookupItem =
  | {
      kind: 'sign';
      /** what the learner typed for this span */
      source: string;
      /** normalised dictionary gloss that matched; used as the key for pinned signs */
      key: string;
      /** every sign for this word: dialects and variants */
      entries: LexEntry[];
      via: Via;
    }
  | { kind: 'skipped'; source: string; reason: string }
  | { kind: 'missing'; source: string; note?: string; suggestions: Suggestion[] };

export interface ChoicePrefs {
  dialect: Exclude<Dialect, 'both'>;
  /** normalised gloss -> entry id */
  pins: Record<string, string>;
}

/** The sign to show first for a word: the pinned one, else the preferred dialect, else a shared one, else the other dialect. */
export function chooseEntry(entries: LexEntry[], key: string, prefs: ChoicePrefs): LexEntry {
  const pinned = entries.find((e) => e.id === prefs.pins[key]);
  if (pinned) return pinned;
  const rank = (e: LexEntry) => (e.dialect === prefs.dialect ? 0 : e.dialect === 'both' ? 1 : 2);
  return entries.reduce((best, e) => (rank(e) < rank(best) ? e : best), entries[0]);
}

interface Found {
  key: string;
  entries: LexEntry[];
  via: Via;
}

function uniq(hits: Hit[]): LexEntry[] {
  return [...new Set(hits.map((h) => h.entry))];
}

function findEnglish(index: MatchIndex, phrase: string): Found | null {
  const words = phrase.split(' ');
  const last = words.at(-1)!;
  const forms = stems(last).map((s) => [...words.slice(0, -1), s].join(' '));
  const allowSynonym = words.length > 1 || (!NO_SYNONYM_FALLBACK.has(phrase) && phrase.length >= 2);

  const alias = ALIASES[phrase];
  if (alias) {
    const hits = index.byGloss.get(alias);
    if (hits?.length) return { key: alias, entries: uniq(hits.filter((h) => h.primary).length ? hits.filter((h) => h.primary) : hits), via: 'alias' };
  }

  // Primary glosses first (exact, then inflected), and only then synonyms.
  for (const [i, form] of forms.entries()) {
    const primary = index.byGloss.get(form)?.filter((h) => h.primary);
    if (primary?.length) return { key: form, entries: uniq(primary), via: i === 0 ? 'exact' : 'inflection' };
  }
  if (words.length === 1) {
    const joined = index.squashed.get(phrase);
    const hits = joined ? index.byGloss.get(joined) : undefined;
    if (hits?.length) {
      const prim = hits.filter((h) => h.primary);
      return { key: joined!, entries: uniq(prim.length ? prim : hits), via: 'joined' };
    }
  }
  if (allowSynonym) {
    for (const form of forms) {
      const hits = index.byGloss.get(form);
      if (hits?.length) return { key: form, entries: uniq(hits), via: 'synonym' };
    }
  }
  return null;
}

function firstFor(index: MatchIndex, gloss: string): LexEntry | undefined {
  const hits = index.byGloss.get(gloss);
  if (!hits?.length) return undefined;
  const primary = hits.filter((h) => h.primary);
  return (primary.length ? primary : hits)[0].entry;
}

function suggestEnglish(index: MatchIndex, word: string): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (e: LexEntry | undefined, why: Suggestion['why']) => {
    if (e && !out.some((s) => s.entryId === e.id || (s.label === e.english[0] && s.chinese === e.chinese))) {
      out.push({ entryId: e.id, label: e.english[0], chinese: e.chinese, why });
    }
  };
  for (const g of RELATED[word] ?? []) add(firstFor(index, g), 'related');
  // Short words are usually real words with no sign, not typos, so only longer ones get "did you mean".
  if (word.length >= 5 && /^[a-z']+$/.test(word)) {
    const max = word.length >= 9 ? 2 : 1;
    const typos = index.singleWords
      .filter((w) => w.length >= 4 && w[0] === word[0] && editDistance(w, word, max) <= max)
      .sort((a, b) => editDistance(a, word, max) - editDistance(b, word, max) || a.localeCompare(b))
      .slice(0, 3);
    for (const t of typos) add(firstFor(index, t), 'typo');
  }
  return out.slice(0, 5);
}

function lookupEnglish(index: MatchIndex, text: string): LookupItem[] {
  const words = normalizeText(text).split(' ').filter(Boolean);
  const items: LookupItem[] = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i];

    if (/^\d+$/.test(w)) {
      const gloss = NUMBER_WORDS[w];
      const found = gloss ? findEnglish(index, gloss) : null;
      if (found) items.push({ kind: 'sign', source: w, key: found.key, entries: found.entries, via: 'number' });
      else {
        const digits = [...new Set([...w])].map((d) => firstFor(index, NUMBER_WORDS[d] ?? '')).filter((e): e is LexEntry => !!e);
        items.push({
          kind: 'missing',
          source: w,
          note: 'Only numbers that have their own sign can be looked up. The single digits are offered below.',
          suggestions: digits.map((e) => ({ entryId: e.id, label: e.english[0], chinese: e.chinese, why: 'digit' as const })),
        });
      }
      i++;
      continue;
    }

    let matched = false;
    for (let n = Math.min(Math.max(index.maxWords, ALIAS_MAX_WORDS), words.length - i); n >= 1; n--) {
      // "a lot" is a phrase sign, but a lone article is never looked up.
      if (n === 1 && ARTICLES.has(w)) break;
      const phrase = words.slice(i, i + n).join(' ');
      const found = findEnglish(index, phrase);
      if (found) {
        items.push({ kind: 'sign', source: phrase, key: found.key, entries: found.entries, via: found.via });
        i += n;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    if (ARTICLES.has(w) || COPULAS.has(w)) items.push({ kind: 'skipped', source: w, reason: SKIPPED_REASON });
    else items.push({ kind: 'missing', source: w, suggestions: suggestEnglish(index, w) });
    i++;
  }
  return items;
}

function lookupChinese(index: MatchIndex, text: string): LookupItem[] {
  const chars = [...text];
  const items: LookupItem[] = [];
  let pendingMiss = '';
  const flush = () => {
    if (!pendingMiss) return;
    const suggestions: Suggestion[] = [];
    for (const ch of new Set([...pendingMiss])) {
      for (const [zh, entries] of index.byZh) {
        if (suggestions.length >= 5) break;
        if (zh.includes(ch)) suggestions.push({ entryId: entries[0].id, label: entries[0].english[0], chinese: zh, why: 'contains' });
      }
    }
    items.push({ kind: 'missing', source: pendingMiss, suggestions });
    pendingMiss = '';
  };
  let i = 0;
  while (i < chars.length) {
    let hit = false;
    for (let n = Math.min(index.maxZh, chars.length - i); n >= 1; n--) {
      const key = chars.slice(i, i + n).join('');
      const entries = index.byZh.get(key);
      if (entries) {
        flush();
        items.push({ kind: 'sign', source: key, key: `zh:${key}`, entries, via: 'chinese' });
        i += n;
        hit = true;
        break;
      }
    }
    if (!hit) pendingMiss += chars[i++];
  }
  flush();
  return items;
}

/**
 * Gloss lookup: longest phrase first, then single words, then synonyms. Words with no sign are reported, never guessed.
 * This is a lookup of dictionary signs in typed order, not a translation into TSL grammar.
 */
export function lookup(index: MatchIndex, text: string): LookupItem[] {
  const out: LookupItem[] = [];
  for (const run of splitScripts(text)) {
    out.push(...(run.cjk ? lookupChinese(index, run.text) : lookupEnglish(index, run.text)));
  }
  return out;
}

export { siblings };
