import type { LexEntry } from '../lexicon/types.ts';
import { editDistance, normalizeText, stems } from '../match/normalize.ts';

export type TypedResult = 'exact' | 'typo' | 'wrong';

/**
 * Checks a typed answer against every accepted meaning of a sign: its English glosses (primary and synonyms),
 * its Chinese gloss, and the same for signs that share the primary gloss (variants of the same word).
 * Plural/-ing forms count as exact; one slip in a longer word counts as a typo. Other signs' words never match.
 */
export function checkTyped(target: LexEntry, variants: LexEntry[], input: string): TypedResult {
  const raw = input.trim();
  if (!raw) return 'wrong';
  const accepted = new Set<string>();
  const zh = new Set<string>();
  for (const e of [target, ...variants]) {
    for (const g of e.english) accepted.add(normalizeText(g));
    if (e.chinese) zh.add(e.chinese);
  }
  if (zh.has(raw)) return 'exact';

  const typed = normalizeText(raw);
  if (!typed) return 'wrong';
  const words = typed.split(' ');
  const forms = stems(words.at(-1)!).map((s) => [...words.slice(0, -1), s].join(' '));
  if (forms.some((f) => accepted.has(f))) return 'exact';

  const max = typed.length >= 9 ? 2 : typed.length >= 5 ? 1 : 0;
  if (max > 0) {
    for (const a of accepted) if (editDistance(typed, a, max) <= max) return 'typo';
  }
  return 'wrong';
}
