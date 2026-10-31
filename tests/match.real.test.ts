import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Lexicon } from '../src/lexicon/types.ts';
import { buildIndex } from '../src/match/index.ts';
import { lookup, type LookupItem } from '../src/match/lookup.ts';

// Runs against the generated sign list when it exists locally (npm run lexicon); skipped in CI.
const path = 'public/data/lexicon.json';
const real = existsSync(path);

describe.skipIf(!real)('lookup against the real dictionary', () => {
  const lex = JSON.parse(readFileSync(path, 'utf8')) as Lexicon;
  const index = buildIndex(lex);
  const summary = (t: string) =>
    lookup(index, t).map((i: LookupItem) => (i.kind === 'sign' ? `${i.entries[0].english[0]}` : `${i.kind}:${i.source}`));

  it('Hello is reported as having no sign, with no sign item at all', () => {
    const items = lookup(index, 'Hello');
    expect(items.map((i) => i.kind)).toEqual(['missing']);
  });
  it('Thank you finds the thank signs', () => {
    const [x] = lookup(index, 'Thank you');
    expect(x.kind).toBe('sign');
    if (x.kind === 'sign') expect(x.entries.length).toBeGreaterThanOrEqual(2);
  });
  it('How are you', () => {
    expect(summary('How are you')).toEqual(['how', 'skipped:are', 'you']);
  });
  it('goodbye, please, sorry, cats, digits', () => {
    expect(summary('goodbye')).toEqual(['good bye']);
    expect(summary('please sorry')).toEqual(['please', 'sorry']);
    expect(summary('cats')).toEqual(['cat']);
    expect(summary('1 2 5')).toEqual(['one', 'two', 'five']);
  });
  it('the modal "will" never turns into the noun "volition"', () => {
    const items = lookup(index, 'will');
    for (const i of items) if (i.kind === 'sign') expect(i.entries.every((e) => !/volition/i.test(e.english[0]))).toBe(true);
  });
});
