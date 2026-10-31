import { describe, expect, it } from 'vitest';
import { validateLexicon } from '../src/lexicon/validate.ts';
import type { LexEntry } from '../src/lexicon/types.ts';

const base = (o: Partial<LexEntry>): LexEntry => ({
  id: 'a', chinese: '一', english: ['one'], category: 'numbers', dialect: 'both',
  video: 'O/one.mp4', sourceUrl: 'https://twtsl.ccu.edu.tw/', licenseNote: 'x', ...o,
});
const ok = () => true;
const rules = (e: LexEntry[], f = ok) => validateLexicon(e, f).map((i) => i.rule);

describe('validateLexicon', () => {
  it('passes a clean lexicon', () => {
    expect(rules([base({}), base({ id: 'b', english: ['two'] })])).toEqual([]);
  });
  it('flags a missing clip', () => {
    expect(rules([base({})], () => false)).toEqual(['missing-clip']);
  });
  it('flags duplicate ids', () => {
    expect(rules([base({}), base({ english: ['two'] })])).toContain('duplicate-id');
  });
  it('flags entries with no gloss at all', () => {
    expect(rules([base({ chinese: null, english: [] })])).toEqual(['no-gloss']);
    expect(rules([base({ chinese: null, english: ['x'] })])).toEqual([]);
  });
  it('flags an English word with several unlabeled signs', () => {
    const r = rules([base({ id: 'a1', english: ['able'] }), base({ id: 'a2', english: ['able'] })]);
    expect(r.filter((x) => x === 'ambiguous-english')).toHaveLength(2);
  });
  it('accepts dialect labels as disambiguation', () => {
    const e = [base({ id: 'a_n', english: ['able'], dialect: 'north' }), base({ id: 'a_s', english: ['able'], dialect: 'south' })];
    expect(rules(e)).toEqual([]);
  });
  it('accepts sense labels as disambiguation', () => {
    const e = [base({ id: 'x1', english: ['car'], senseLabel: 'Variant A' }), base({ id: 'x2', english: ['car'], senseLabel: 'Variant B' })];
    expect(rules(e)).toEqual([]);
  });
  it('rejects two entries sharing the same label', () => {
    const e = [base({ id: 'x1', english: ['car'], senseLabel: 'A' }), base({ id: 'x2', english: ['car'], senseLabel: 'A' })];
    expect(rules(e)).toContain('ambiguous-english');
  });
});
