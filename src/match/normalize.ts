import { IRREGULAR } from './data.ts';

const CJK = /[㐀-鿿豈-﫿]/;
export const isCjk = (ch: string): boolean => CJK.test(ch);

/** Lower-case, unify quotes, drop punctuation (keeping apostrophes), collapse spaces. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits input into runs of Chinese characters and runs of everything else. */
export function splitScripts(s: string): { cjk: boolean; text: string }[] {
  const runs: { cjk: boolean; text: string }[] = [];
  for (const ch of s) {
    const cjk = isCjk(ch);
    const last = runs.at(-1);
    if (last && last.cjk === cjk) last.text += ch;
    else runs.push({ cjk, text: ch });
  }
  return runs;
}

/**
 * Candidate base forms of an English word, most likely first, always starting with the word itself.
 * Only simple regular inflections plus a short irregular table; the caller still has to find the
 * candidate in the dictionary, so a wrong candidate is harmless.
 */
export function stems(word: string): string[] {
  const out = [word];
  const add = (w: string) => {
    if (w.length >= 2 && !out.includes(w)) out.push(w);
  };
  if (IRREGULAR[word]) add(IRREGULAR[word]);
  if (word.endsWith('ies')) add(`${word.slice(0, -3)}y`);
  if (word.endsWith('es')) add(word.slice(0, -2));
  if (word.endsWith('s') && !word.endsWith('ss')) add(word.slice(0, -1));
  for (const suffix of ['ing', 'ed']) {
    if (!word.endsWith(suffix) || word.length <= suffix.length + 2) continue;
    const base = word.slice(0, -suffix.length);
    add(base);
    add(`${base}e`);
    if (/(.)\1$/.test(base)) add(base.slice(0, -1)); // running -> run
    if (suffix === 'ed' && word.endsWith('ied')) add(`${word.slice(0, -3)}y`);
  }
  return out;
}

/** Damerau-Levenshtein distance, giving up (returning max+1) once it must exceed `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev2.length = 0;
    prev2.push(...prev);
    prev = cur;
  }
  return prev[b.length];
}
