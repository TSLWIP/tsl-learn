import type { LexEntry } from '../lexicon/types.ts';
import type { MatchIndex } from '../match/index.ts';
import { siblings } from '../match/index.ts';
import { normalizeText } from '../match/normalize.ts';
import type { Rng } from './rng.ts';
import { shuffle } from './rng.ts';
import type { Lang } from './types.ts';

export type Confusions = Record<string, string[]>;
const MAX_PER_SIGN = 6;

/** Remembers that `wrongId` was picked when `askedId` was the answer (newest first, no repeats, capped). */
export function addConfusion(map: Confusions, askedId: string, wrongId: string): Confusions {
  const list = [wrongId, ...(map[askedId] ?? []).filter((x) => x !== wrongId)].slice(0, MAX_PER_SIGN);
  return { ...map, [askedId]: list };
}

export function optionLabel(e: LexEntry, lang: Lang): string {
  return lang === 'zh' ? (e.chinese ?? '') : (e.english[0] ?? '');
}

export interface DistractorOpts {
  count?: number;
  /** entries the learner has mistaken for the target before */
  confusedWith?: string[];
  /** which text the options will show; clip options only need to be different signs */
  label: Lang | 'clip';
  rng: Rng;
  /** signs already in the question (e.g. the rest of a matching set) that must not be picked */
  exclude?: LexEntry[];
}

/**
 * Wrong answers that are worth picking: signs the learner has confused before, then the same category,
 * then signs sharing a Chinese character, then anything else. Never the target, never a variant of the same
 * word, and never two options that would show the same text.
 */
export function pickDistractors(index: MatchIndex, target: LexEntry, opts: DistractorOpts): LexEntry[] {
  const count = opts.count ?? 3;
  const sameWord = new Set(siblings(index, target).map((e) => e.id));
  sameWord.add(target.id);
  const labelOf = (e: LexEntry) => (opts.label === 'clip' ? e.id : normalizeText(optionLabel(e, opts.label)));
  const taken = new Set<string>([labelOf(target)]);
  // two signs with the same primary English word are the same word to a learner, even in other groups
  const takenWords = new Set<string>([normalizeText(target.english[0] ?? '')]);
  for (const x of opts.exclude ?? []) {
    sameWord.add(x.id);
    takenWords.add(normalizeText(x.english[0] ?? ''));
  }
  const chosen: LexEntry[] = [];

  const usable = (e: LexEntry) => {
    if (sameWord.has(e.id)) return false;
    if (opts.label !== 'clip' && !optionLabel(e, opts.label).trim()) return false;
    if (taken.has(labelOf(e))) return false;
    if (takenWords.has(normalizeText(e.english[0] ?? ''))) return false;
    return true;
  };
  const take = (pool: LexEntry[]) => {
    for (const e of shuffle(pool, opts.rng)) {
      if (chosen.length >= count) return;
      if (!usable(e)) continue;
      chosen.push(e);
      taken.add(labelOf(e));
      takenWords.add(normalizeText(e.english[0] ?? ''));
    }
  };

  take((opts.confusedWith ?? []).flatMap((id) => index.byId.get(id) ?? []));
  if (chosen.length < count && target.category !== 'more') {
    take(index.entries.filter((e) => e.category === target.category));
  }
  if (chosen.length < count && target.chinese) {
    const chars = new Set([...target.chinese]);
    take(index.entries.filter((e) => e.chinese && [...e.chinese].some((c) => chars.has(c))));
  }
  if (chosen.length < count) take(index.entries);
  return chosen;
}
