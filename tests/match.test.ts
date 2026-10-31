import { describe, expect, it } from 'vitest';
import type { LexEntry } from '../src/lexicon/types.ts';
import { buildIndex, searchEntries, siblings, typeahead } from '../src/match/index.ts';
import { chooseEntry, lookup, type LookupItem } from '../src/match/lookup.ts';
import { editDistance, normalizeText, stems } from '../src/match/normalize.ts';

const e = (id: string, english: string[], chinese: string | null, extra: Partial<LexEntry> = {}): LexEntry => ({
  id, english, chinese, category: 'more', dialect: 'both', video: `x/${id}.mp4`, sourceUrl: '', licenseNote: '', ...extra,
});

const lexicon = {
  entries: [
    e('thank_a', ['thank', 'express gratitude'], '感謝', { senseLabel: 'Variant A' }),
    e('thank_b', ['thank', 'express gratitude'], '感謝', { senseLabel: 'Variant B' }),
    e('thank_n', ['thank', 'gratitude'], '感謝', { dialect: 'north' }),
    e('thank_s', ['thank'], '感謝', { dialect: 'south' }),
    e('you', ['you'], '你'),
    e('how_a', ['how'], '怎麼', { senseLabel: 'Variant A' }),
    e('how_b', ['how'], '怎麼', { senseLabel: 'Variant B' }),
    e('good_bye', ['good bye', 'farewell'], '再見'),
    e('i_a', ['i', 'me'], '我', { senseLabel: 'Variant A' }),
    e('i_b', ['i', 'me'], '我', { senseLabel: 'Variant B' }),
    e('one', ['one'], '一'),
    e('two_a', ['two'], '二', { senseLabel: 'Variant A' }),
    e('five_a', ['five'], '五', { senseLabel: 'Variant A' }),
    e('eleven', ['eleven'], '十一'),
    e('cat', ['cat'], '貓'),
    e('run', ['run', 'jog'], '跑'),
    e('eat', ['eat'], '吃'),
    e('a_lot', ['a lot', 'many'], '很多'),
    e('volition', ['volition', 'will'], '意志'),
    e('welcome_b', ['welcome', 'greet'], '歡迎'),
    e('shake_hands', ['shake hands'], '握手'),
    e('my_pleasure', ['my pleasure', "you're welcome"], '不客氣'),
    e('please', ['please'], '請'),
  ],
};
const index = buildIndex(lexicon);
const run = (text: string) => lookup(index, text);
const summary = (items: LookupItem[]) =>
  items.map((i) => (i.kind === 'sign' ? `${i.entries[0].english[0]}:${i.via}` : `${i.kind}:${i.source}`));

describe('normalizeText / stems / editDistance', () => {
  it('normalises case, punctuation and quotes', () => {
    expect(normalizeText("  THANK-YOU!!  It’s  ")).toBe("thank you it's");
  });
  it('proposes base forms, original first', () => {
    expect(stems('cats')).toEqual(['cats', 'cat']);
    expect(stems('running')).toContain('run');
    expect(stems('liked')).toContain('like');
    expect(stems('studies')).toContain('study');
    expect(stems('ate')).toContain('eat');
    expect(stems('go')[0]).toBe('go');
  });
  it('measures transpositions as one edit and gives up early', () => {
    expect(editDistance('thnak', 'thank', 1)).toBe(1);
    expect(editDistance('abcdef', 'uvwxyz', 1)).toBeGreaterThan(1);
  });
});

describe('lookup: required cases', () => {
  it('"Hello" has no sign: reported, never replaced by a wrong or generic one', () => {
    const items = run('Hello');
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('missing');
    const miss = items[0] as Extract<LookupItem, { kind: 'missing' }>;
    expect(miss.suggestions.map((s) => s.label)).toEqual(['welcome', 'shake hands']);
    expect(miss.suggestions.every((s) => s.why === 'related')).toBe(true);
  });

  it('"Thank you" resolves to the dictionary sign for "thank", with every dialect and variant', () => {
    const items = run('Thank you');
    expect(summary(items)).toEqual(['thank:alias']);
    const item = items[0] as Extract<LookupItem, { kind: 'sign' }>;
    expect(item.entries.map((x) => x.id)).toEqual(['thank_a', 'thank_b', 'thank_n', 'thank_s']);
  });

  it('"How are you": a word with no dictionary sign is skipped visibly, the rest are matched', () => {
    expect(summary(run('How are you?'))).toEqual(['how:exact', 'skipped:are', 'you:exact']);
  });

  it('numbers: digits with a sign are looked up; other numbers are reported with digit suggestions', () => {
    expect(summary(run('1 2 5'))).toEqual(['one:number', 'two:number', 'five:number']);
    expect(summary(run('11'))).toEqual(['eleven:number']);
    const [x] = run('25');
    expect(x.kind).toBe('missing');
    expect((x as Extract<LookupItem, { kind: 'missing' }>).suggestions.map((s) => s.label)).toEqual(['two', 'five']);
  });
});

describe('lookup: matching order and honesty', () => {
  it('prefers the longest phrase', () => {
    expect(summary(run('thank you very much'))).toEqual(['thank:alias']);
    expect(summary(run('a lot'))).toEqual(['a lot:exact']);
  });
  it('skips lone articles but not articles inside phrase signs', () => {
    expect(summary(run('the cat'))).toEqual(['skipped:the', 'cat:exact']);
  });
  it('handles plurals, -ing and irregular forms', () => {
    expect(summary(run('cats'))).toEqual(['cat:inflection']);
    expect(summary(run('running'))).toEqual(['run:inflection']);
    expect(summary(run('ate'))).toEqual(['eat:inflection']);
  });
  it('joins "goodbye" to "good bye"', () => {
    expect(summary(run('goodbye'))).toEqual(['good bye:joined']);
    expect(summary(run('good bye'))).toEqual(['good bye:exact']);
  });
  it('uses synonyms, labelled as such', () => {
    expect(summary(run('me'))).toEqual(['i:synonym']);
    expect(summary(run('jog'))).toEqual(['run:synonym']);
  });
  it('never routes closed-class words through synonyms ("will" is not "volition")', () => {
    expect(summary(run('will'))).toEqual(['missing:will']);
  });
  it('offers typo suggestions but never auto-corrects', () => {
    const [x] = run('thnak');
    expect(x.kind).toBe('missing');
    expect((x as Extract<LookupItem, { kind: 'missing' }>).suggestions[0]).toMatchObject({ label: 'thank', why: 'typo' });
  });
  it('gives nothing for nonsense', () => {
    const [x] = run('asdfgh');
    expect(x).toMatchObject({ kind: 'missing', suggestions: [] });
  });
  it('keeps typed order and reports each gap', () => {
    expect(summary(run('I eat zzz cats'))).toEqual(['i:exact', 'eat:exact', 'missing:zzz', 'cat:inflection']);
  });
  it('looks up Chinese, longest match first, and reports unknown characters', () => {
    expect(summary(run('感謝你'))).toEqual(['thank:chinese', 'you:chinese']);
    expect(summary(run('你龘'))).toEqual(['you:chinese', 'missing:龘']);
    expect(summary(run('Thank 你'))).toEqual(['thank:exact', 'you:chinese']);
  });
  it('returns nothing for empty input', () => {
    expect(run('   ')).toEqual([]);
    expect(run('?!')).toEqual([]);
  });
});

describe('chooseEntry', () => {
  const thank = lexicon.entries.slice(0, 4);
  it('prefers the chosen dialect, then shared signs', () => {
    expect(chooseEntry(thank, 'thank', { dialect: 'north', pins: {} }).id).toBe('thank_n');
    expect(chooseEntry(thank, 'thank', { dialect: 'south', pins: {} }).id).toBe('thank_s');
    const shared = thank.slice(0, 2);
    expect(chooseEntry(shared, 'thank', { dialect: 'south', pins: {} }).id).toBe('thank_a');
  });
  it('a pinned sign always wins', () => {
    expect(chooseEntry(thank, 'thank', { dialect: 'north', pins: { thank: 'thank_b' } }).id).toBe('thank_b');
  });
  it('ignores a pin that is not among the candidates', () => {
    expect(chooseEntry(thank, 'thank', { dialect: 'north', pins: { thank: 'gone' } }).id).toBe('thank_n');
  });
});

describe('siblings, typeahead, library search', () => {
  it('lists the variants of a sign', () => {
    expect(siblings(index, lexicon.entries[0]).map((x) => x.id)).toEqual(['thank_a', 'thank_b', 'thank_n', 'thank_s']);
  });
  it('typeahead prefix and Chinese, one row per word', () => {
    const t = typeahead(index, 'tha');
    expect(t[0].label).toBe('thank');
    expect(t.filter((x) => x.label === 'thank')).toHaveLength(1);
    expect(typeahead(index, '感')[0].label).toBe('thank');
    expect(typeahead(index, '')).toEqual([]);
  });
  it('search ranks exact over prefix over synonym, and forgives one typo', () => {
    expect(searchEntries(index, 'cat')[0].id).toBe('cat');
    expect(searchEntries(index, 'jog')[0].id).toBe('run');
    expect(searchEntries(index, 'thnak')[0].english[0]).toBe('thank');
    expect(searchEntries(index, '貓').map((x) => x.id)).toEqual(['cat']);
    expect(searchEntries(index, 'zzzzz')).toEqual([]);
  });
});
