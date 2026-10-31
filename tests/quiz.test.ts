import { describe, expect, it } from 'vitest';
import type { LexEntry } from '../src/lexicon/types.ts';
import { buildIndex, siblings } from '../src/match/index.ts';
import { addConfusion, optionLabel, pickDistractors } from '../src/quiz/distractors.ts';
import { mulberry32, shuffle } from '../src/quiz/rng.ts';
import {
  buildQuestions, deckUnits, groupUnits, introducedToday, mistakeReview, newBudget, selectDue, selectNew, selectPractice,
  type ProgressMap,
} from '../src/quiz/session.ts';
import { checkTyped } from '../src/quiz/typed.ts';
import { DAY, newProgress, schedule } from '../src/srs/sm2.ts';

const e = (id: string, english: string[], chinese: string | null, category = 'more', extra: Partial<LexEntry> = {}): LexEntry => ({
  id, english, chinese, category, dialect: 'both', video: `x/${id}.mp4`, sourceUrl: '', licenseNote: '', ...extra,
});

const food = ['apple', 'bread', 'rice', 'noodle', 'soup', 'tea'].map((w, i) => e(w, [w], `食${i}`, 'food'));
const family = ['mother', 'father', 'sister', 'brother', 'uncle', 'aunt'].map((w, i) => e(w, [w], `親${i}`, 'family'));
const other = Array.from({ length: 20 }, (_, i) => e(`w${i}`, [`word${i}`], `字${i}`));
const entries: LexEntry[] = [
  ...food, ...family, ...other,
  e('thank_a', ['thank', 'gratitude'], '感謝', 'more', { senseLabel: 'Variant A' }),
  e('thank_b', ['thank'], '感謝', 'more', { senseLabel: 'Variant B' }),
  e('thank_n', ['thank'], '感謝', 'more', { dialect: 'north' }),
  e('bat1', ['bat'], '蝙蝠', 'more', { senseLabel: 'animal' }),
  e('bat2', ['bat'], '球棒', 'more', { senseLabel: 'sports' }),
  e('cat', ['cat', 'kitty'], '貓'),
  e('nozh', ['nozh'], null),
];
const index = buildIndex({ entries });
const prefs = { dialect: 'north' as const, pins: {} };
const rng = () => mulberry32(7);
const by = (id: string) => index.byId.get(id)!;

describe('checkTyped', () => {
  const cat = by('cat');
  const ok = (s: string) => checkTyped(cat, siblings(index, cat), s);
  it('accepts the English word however it is typed', () => {
    expect(ok('cat')).toBe('exact');
    expect(ok('  CAT! ')).toBe('exact');
    expect(ok('cats')).toBe('exact');
  });
  it('accepts synonyms and the Chinese gloss', () => {
    expect(ok('kitty')).toBe('exact');
    expect(ok('貓')).toBe('exact');
  });
  it('accepts a gloss of any variant of the same word', () => {
    const t = by('thank_b');
    expect(checkTyped(t, siblings(index, t), 'gratitude')).toBe('exact');
  });
  it('forgives one slip in longer words, but not in short ones', () => {
    const t = by('thank_a');
    expect(checkTyped(t, siblings(index, t), 'thnak')).toBe('typo');
    expect(checkTyped(t, siblings(index, t), 'gratitud')).toBe('typo');
    expect(ok('cut')).toBe('wrong');
  });
  it('rejects other signs and empty answers', () => {
    expect(ok('dog')).toBe('wrong');
    expect(ok('apple')).toBe('wrong');
    expect(ok('')).toBe('wrong');
    expect(ok('   ')).toBe('wrong');
  });
});

describe('pickDistractors', () => {
  it('returns three distinct, usable wrong answers', () => {
    const d = pickDistractors(index, by('apple'), { label: 'en', rng: rng() });
    expect(d).toHaveLength(3);
    expect(new Set(d.map((x) => x.id)).size).toBe(3);
    expect(d.map((x) => x.id)).not.toContain('apple');
  });
  it('prefers the same category when there are enough', () => {
    const d = pickDistractors(index, by('apple'), { label: 'en', rng: rng() });
    expect(d.every((x) => x.category === 'food')).toBe(true);
  });
  it('puts previously confused signs first', () => {
    const d = pickDistractors(index, by('apple'), { label: 'en', confusedWith: ['mother', 'uncle'], rng: rng() });
    expect(d.slice(0, 2).map((x) => x.id).sort()).toEqual(['mother', 'uncle']);
  });
  it('never offers a variant of the answer, or two options with the same text', () => {
    for (let seed = 0; seed < 40; seed++) {
      const d = pickDistractors(index, by('thank_a'), { label: 'en', rng: mulberry32(seed) });
      expect(d.map((x) => x.id)).not.toContain('thank_b');
      expect(d.map((x) => x.id)).not.toContain('thank_n');
      const texts = [by('thank_a'), ...d].map((x) => optionLabel(x, 'en'));
      expect(new Set(texts).size).toBe(4);
    }
    for (let seed = 0; seed < 40; seed++) {
      const d = pickDistractors(index, by('bat1'), { label: 'clip', rng: mulberry32(seed) });
      expect(d.map((x) => x.id)).not.toContain('bat2'); // same English word: would be ambiguous
    }
  });
  it('Chinese options skip signs that have no Chinese', () => {
    for (let seed = 0; seed < 30; seed++) {
      const d = pickDistractors(index, by('cat'), { label: 'zh', rng: mulberry32(seed) });
      expect(d.every((x) => !!x.chinese)).toBe(true);
    }
  });
  it('is repeatable for a given seed', () => {
    const a = pickDistractors(index, by('rice'), { label: 'en', rng: mulberry32(3) }).map((x) => x.id);
    const b = pickDistractors(index, by('rice'), { label: 'en', rng: mulberry32(3) }).map((x) => x.id);
    expect(a).toEqual(b);
  });
  it('remembers confusions, newest first and capped', () => {
    let m = {};
    for (let i = 0; i < 10; i++) m = addConfusion(m, 'a', `w${i}`);
    m = addConfusion(m, 'a', 'w5');
    const list = (m as Record<string, string[]>).a;
    expect(list[0]).toBe('w5');
    expect(list).toHaveLength(6);
    expect(new Set(list).size).toBe(6);
  });
});

describe('session building', () => {
  const units = groupUnits(index, entries, prefs);
  it('collapses variants into one unit using the learner dialect', () => {
    const thank = units.filter((u) => u.key === 'thank');
    expect(thank).toHaveLength(1);
    expect(thank[0].entry.id).toBe('thank_n');
    expect(groupUnits(index, entries, { dialect: 'south', pins: {} }).find((u) => u.key === 'thank')!.entry.id).toBe('thank_a');
    expect(groupUnits(index, entries, { dialect: 'north', pins: { thank: 'thank_b' } }).find((u) => u.key === 'thank')!.entry.id).toBe('thank_b');
  });
  it('custom decks keep exactly the chosen signs and drop ones that no longer exist', () => {
    const u = deckUnits(index, { id: 'd', schemaVersion: 2, name: 'x', signIds: ['thank_b', 'gone', 'cat'] });
    expect(u.map((x) => x.entry.id)).toEqual(['thank_b', 'cat']);
  });

  const now = Date.UTC(2026, 5, 1, 9);
  const progress: ProgressMap = new Map();
  const unit = (id: string) => units.find((u) => u.entry.id === id)!;
  progress.set('apple', { ...schedule(undefined, 'apple', 'good', now - 3 * DAY), dueAt: now - 2 * DAY });
  progress.set('bread', { ...schedule(undefined, 'bread', 'good', now - 3 * DAY), dueAt: now - 1 * DAY });
  progress.set('rice', { ...schedule(undefined, 'rice', 'good', now), dueAt: now + DAY });

  it('due signs are the overdue ones, most overdue first', () => {
    expect(selectDue(units, progress, now).map((u) => u.entry.id)).toEqual(['apple', 'bread']);
  });
  it('new signs are the ones never seen', () => {
    const ids = selectNew(units, progress).map((u) => u.entry.id);
    expect(ids).not.toContain('apple');
    expect(ids).toContain('noodle');
  });
  it('the daily cap counts signs introduced today', () => {
    const p: ProgressMap = new Map();
    for (const id of ['a', 'b', 'c']) p.set(id, newProgress(id, now));
    p.set('old', { ...newProgress('old', now - 5 * DAY) });
    expect(introducedToday(p, now)).toBe(3);
    expect(newBudget(p, 5, now)).toBe(2);
    expect(newBudget(p, 3, now)).toBe(0);
    expect(newBudget(p, 2, now)).toBe(0);
  });
  it('a quick round puts due signs first, then met ones, then new ones', () => {
    const ids = selectPractice(units, progress, now, 5, mulberry32(1)).map((u) => u.entry.id);
    expect(ids.slice(0, 3)).toEqual(['apple', 'bread', 'rice']);
    expect(ids).toHaveLength(5);
  });

  const o = { index, rng: mulberry32(11), confusions: {}, langPref: 'mixed' as const };
  it('mixed sessions rotate through the four question styles', () => {
    const qs = buildQuestions(units.slice(0, 8), 'mixed', o);
    expect(qs.map((q) => q.mode)).toEqual([
      'sign-to-meaning', 'meaning-to-sign', 'typed', 'flashcard', 'sign-to-meaning', 'meaning-to-sign', 'typed', 'flashcard',
    ]);
  });
  it('multiple-choice questions contain the answer exactly once among four options', () => {
    for (const mode of ['sign-to-meaning', 'meaning-to-sign'] as const) {
      for (const q of buildQuestions(units.slice(0, 12), mode, { ...o, rng: mulberry32(5) })) {
        if (q.mode !== mode) throw new Error('wrong mode');
        expect(q.options).toHaveLength(4);
        expect(q.options.filter((x) => x.id === q.target.id)).toHaveLength(1);
      }
    }
  });
  it('mixed language alternates English and Chinese options', () => {
    const qs = buildQuestions(units.slice(0, 4), 'sign-to-meaning', o);
    expect(qs.map((q) => (q.mode === 'sign-to-meaning' ? q.lang : ''))).toEqual(['en', 'zh', 'en', 'zh']);
  });
  it('new signs are introduced first (ungraded), then asked as recognition questions', () => {
    const qs = buildQuestions(units.slice(0, 3), 'mixed', { ...o, intro: true });
    expect(qs.map((q) => q.mode)).toEqual(['flashcard', 'flashcard', 'flashcard', 'sign-to-meaning', 'sign-to-meaning', 'sign-to-meaning']);
    expect(qs.slice(0, 3).every((q) => !q.graded)).toBe(true);
    expect(qs.slice(3).every((q) => q.graded)).toBe(true);
  });
  it('matching sets are four pairs; a short set is padded with ungraded extras', () => {
    const qs = buildQuestions(units.slice(0, 6), 'matching', o);
    expect(qs).toHaveLength(2);
    for (const q of qs) {
      if (q.mode !== 'matching') throw new Error('x');
      expect(q.pairs).toHaveLength(4);
      expect(new Set(q.pairs.map((p) => p.entry.id)).size).toBe(4);
    }
    const last = qs[1];
    if (last.mode === 'matching') expect(last.pairs.filter((p) => p.graded)).toHaveLength(2);
  });
  it('mistake review asks each missed sign once more, ungraded', () => {
    const qs = mistakeReview([by('apple'), by('rice')], o);
    expect(qs.map((q) => q.mode)).toEqual(['sign-to-meaning', 'sign-to-meaning']);
    expect(qs.every((q) => !q.graded)).toBe(true);
  });
  it('shuffle keeps every item', () => {
    expect(shuffle([1, 2, 3, 4, 5], mulberry32(2)).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
