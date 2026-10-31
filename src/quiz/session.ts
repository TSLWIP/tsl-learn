import type { Deck, SignProgress } from '../storage/types.ts';
import type { LexEntry } from '../lexicon/types.ts';
import { siblings, type MatchIndex } from '../match/index.ts';
import { normalizeText } from '../match/normalize.ts';
import { chooseEntry, type ChoicePrefs } from '../match/lookup.ts';
import { isDue, startOfLocalDay } from '../srs/sm2.ts';
import { optionLabel, pickDistractors, type Confusions } from './distractors.ts';
import { shuffle, type Rng } from './rng.ts';
import type { Question, QuizLangPref, QuizMode, Unit } from './types.ts';

export type ProgressMap = Map<string, SignProgress>;
export type SessionMode = QuizMode | 'mixed';
export const MIXED_CYCLE: QuizMode[] = ['sign-to-meaning', 'meaning-to-sign', 'typed', 'flashcard'];

/** One unit per word: variants collapse to the sign for the learner's dialect (or their pinned choice). */
export function groupUnits(index: MatchIndex, entries: LexEntry[], prefs: ChoicePrefs): Unit[] {
  const seen = new Set<string>();
  const out: Unit[] = [];
  for (const e of entries) {
    const key = normalizeText(e.english[0] ?? '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ entry: chooseEntry(siblings(index, e), key, prefs), key });
  }
  return out;
}

/** A custom deck holds exactly the signs the learner added. */
export function deckUnits(index: MatchIndex, deck: Deck): Unit[] {
  return deck.signIds.flatMap((id) => {
    const entry = index.byId.get(id);
    return entry ? [{ entry, key: normalizeText(entry.english[0] ?? '') }] : [];
  });
}

export function introducedToday(progress: ProgressMap, now: number): number {
  const start = startOfLocalDay(now);
  let n = 0;
  for (const p of progress.values()) if ((p.introducedAt ?? 0) >= start) n++;
  return n;
}

export function newBudget(progress: ProgressMap, perDay: number, now: number): number {
  return Math.max(0, perDay - introducedToday(progress, now));
}

export const selectDue = (units: Unit[], progress: ProgressMap, now: number): Unit[] =>
  units
    .filter((u) => {
      const p = progress.get(u.entry.id);
      return !!p && isDue(p, now);
    })
    .sort((a, b) => progress.get(a.entry.id)!.dueAt - progress.get(b.entry.id)!.dueAt);

export const selectNew = (units: Unit[], progress: ProgressMap): Unit[] => units.filter((u) => !progress.has(u.entry.id));

/** Quick-round targets: what is due first, then signs already met, then new ones. */
export function selectPractice(units: Unit[], progress: ProgressMap, now: number, limit: number, rng: Rng): Unit[] {
  const due = selectDue(units, progress, now);
  const met = shuffle(units.filter((u) => progress.has(u.entry.id) && !due.includes(u)), rng);
  const fresh = selectNew(units, progress);
  return [...due, ...met, ...fresh].slice(0, limit);
}

export interface BuildOpts {
  index: MatchIndex;
  rng: Rng;
  confusions: Confusions;
  langPref: QuizLangPref;
  /** true when these targets are new to the learner and should be introduced before being asked */
  intro?: boolean;
}

function textLang(pref: QuizLangPref, i: number, entries: LexEntry[]): 'en' | 'zh' {
  const zhOk = entries.every((e) => !!e.chinese);
  if (pref === 'zh') return zhOk ? 'zh' : 'en';
  if (pref === 'en') return 'en';
  return zhOk && i % 2 === 1 ? 'zh' : 'en';
}

function question(mode: QuizMode, target: LexEntry, i: number, o: BuildOpts): Question {
  const confusedWith = o.confusions[target.id] ?? [];
  switch (mode) {
    case 'sign-to-meaning': {
      let lang = textLang(o.langPref, i, [target]);
      let wrong = pickDistractors(o.index, target, { label: lang, confusedWith, rng: o.rng });
      if (lang === 'zh' && wrong.length < 3) {
        lang = 'en';
        wrong = pickDistractors(o.index, target, { label: 'en', confusedWith, rng: o.rng });
      }
      return { mode, target, lang, options: shuffle([target, ...wrong], o.rng), graded: true };
    }
    case 'meaning-to-sign': {
      const wrong = pickDistractors(o.index, target, { label: 'clip', confusedWith, rng: o.rng });
      return { mode, target, options: shuffle([target, ...wrong], o.rng), graded: true };
    }
    case 'typed':
      return { mode, target, graded: true };
    default:
      return { mode: 'flashcard', target, intro: false, graded: true };
  }
}

/** Builds the questions for a session. Matching sets are groups of four signs; short groups are padded, ungraded. */
export function buildQuestions(targets: Unit[], mode: SessionMode, o: BuildOpts): Question[] {
  const out: Question[] = [];
  if (o.intro) for (const u of targets) out.push({ mode: 'flashcard', target: u.entry, intro: true, graded: false });

  if (mode === 'matching') {
    for (let i = 0; i < targets.length; i += 4) {
      const chunk = targets.slice(i, i + 4).map((u) => ({ entry: u.entry, graded: true }));
      if (chunk.length < 2 && out.length) continue; // a lone leftover is better asked another way
      for (const e of pickDistractors(o.index, chunk[0].entry, { label: 'clip', count: 4 - chunk.length, rng: o.rng, exclude: chunk.map((c) => c.entry) })) {
        if (chunk.length < 4) chunk.push({ entry: e, graded: false });
      }
      out.push({ mode: 'matching', pairs: shuffle(chunk, o.rng), graded: true });
    }
    return out;
  }
  targets.forEach((u, i) => {
    const m = mode === 'mixed' ? MIXED_CYCLE[i % MIXED_CYCLE.length] : mode;
    // new signs are always asked as a recognition question after the intro, never cold as typed/clip-choice
    out.push(question(o.intro ? 'sign-to-meaning' : m, u.entry, i, o));
  });
  return out;
}

/** The extra pass at the end of a session: every sign the learner missed, once more, ungraded. */
export function mistakeReview(missed: LexEntry[], o: BuildOpts): Question[] {
  return missed.map((e, i) => ({ ...(question('sign-to-meaning', e, i, o) as Extract<Question, { mode: 'sign-to-meaning' }>), graded: false }));
}

export { optionLabel };
