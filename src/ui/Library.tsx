import { useMemo, useState } from 'preact/hooks';
import type { AppContext } from '../boot/boot.ts';
import { searchEntries } from '../match/index.ts';
import type { Prefs } from '../state/prefs.ts';
import { SignDetail, variantName } from './SignDetail.tsx';

const PAGE = 60;

export function Library({ ctx, prefs, onPrefs }: { ctx: AppContext; prefs: Prefs; onPrefs: (p: Prefs) => void }) {
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of ctx.lexicon.entries) m.set(e.category, (m.get(e.category) ?? 0) + 1);
    return m;
  }, [ctx.lexicon]);

  const results = useMemo(() => {
    const pool = category === 'all' ? ctx.lexicon.entries : ctx.lexicon.entries.filter((e) => e.category === category);
    return searchEntries(ctx.index, query, pool);
  }, [ctx, category, query]);

  const entry = selected ? ctx.index.byId.get(selected) : undefined;
  if (entry) {
    return (
      <section>
        <h1 class="sr-only">Sign library: {entry.english[0]}</h1>
        <button class="btn" data-testid="back" onClick={() => setSelected(null)}>
          ← Back to library
        </button>
        <SignDetail key={entry.id} ctx={ctx} entry={entry} prefs={prefs} onPrefs={onPrefs} />
      </section>
    );
  }

  return (
    <section aria-labelledby="lib-h">
      <h1 id="lib-h">Sign library 手語詞庫</h1>
      <input
        type="search"
        class="input"
        data-testid="library-search"
        placeholder="Search English or 中文"
        aria-label="Search the library"
        value={query}
        autoCapitalize="none"
        spellcheck={false}
        onInput={(e) => (setQuery((e.target as HTMLInputElement).value), setShown(PAGE))}
      />
      <div class="cats" role="group" aria-label="Categories">
        <button class="btn" aria-pressed={category === 'all'} data-testid="cat-all" onClick={() => (setCategory('all'), setShown(PAGE))}>
          All · {ctx.lexicon.entries.length}
        </button>
        {ctx.lexicon.categories.map((c) => (
          <button
            key={c.id}
            class="btn"
            aria-pressed={category === c.id}
            data-testid={`cat-${c.id}`}
            onClick={() => (setCategory(c.id), setShown(PAGE))}
          >
            {c.en} {c.zh} · {counts.get(c.id) ?? 0}
          </button>
        ))}
      </div>
      <p class="note" data-testid="library-count" role="status">
        {results.length.toLocaleString()} signs
      </p>
      {results.length === 0 && (
        <div class="card" data-testid="library-empty">
          <h2>No signs match “{query}”</h2>
          <p class="note">Check the spelling, try a simpler word, or search in Chinese. If the dictionary has no sign, none is shown.</p>
        </div>
      )}
      <ul class="plain list" data-testid="library-list">
        {results.slice(0, shown).map((e) => (
          <li key={e.id}>
            <button class="row" data-testid="library-row" onClick={() => setSelected(e.id)}>
              <span class="zh" lang="zh-Hant">
                {e.chinese ?? '—'}
              </span>
              <span class="en">{e.english[0]}</span>
              {(e.dialect !== 'both' || e.senseLabel) && <span class="meta">{variantName(e)}</span>}
            </button>
          </li>
        ))}
      </ul>
      {results.length > shown && (
        <button class="btn" data-testid="show-more" onClick={() => setShown((n) => n + PAGE)}>
          Show more
        </button>
      )}
    </section>
  );
}
