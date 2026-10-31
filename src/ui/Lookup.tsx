import { useMemo, useState } from 'preact/hooks';
import type { AppContext } from '../boot/boot.ts';
import { prefetchClips } from '../clips/load.ts';
import type { LexEntry } from '../lexicon/types.ts';
import { typeahead } from '../match/index.ts';
import { chooseEntry, lookup, type LookupItem, type Suggestion } from '../match/lookup.ts';
import type { MissingFlag, Prefs } from '../state/prefs.ts';
import { SignDetail } from './SignDetail.tsx';

interface Props {
  ctx: AppContext;
  prefs: Prefs;
  onPrefs: (p: Prefs) => void;
  flags: MissingFlag[];
  onFlag: (word: string) => void;
}

const EXAMPLES = ['thank', 'good bye', 'I eat rice', '謝謝'];

function viaBadge(item: Extract<LookupItem, { kind: 'sign' }>): string | null {
  switch (item.via) {
    case 'synonym':
      return 'synonym';
    case 'alias':
      return 'phrase';
    case 'joined':
      return 'joined';
    default:
      return null;
  }
}

function SuggestionList({ ctx, suggestions, onPick }: { ctx: AppContext; suggestions: Suggestion[]; onPick: (e: LexEntry) => void }) {
  if (!suggestions.length) return null;
  const heading = suggestions[0].why === 'typo' ? 'Did you mean' : suggestions[0].why === 'digit' ? 'Single digits' : 'Close matches';
  return (
    <div>
      <p class="note">{heading}</p>
      <ul class="plain chips-inline">
        {suggestions.map((s) => (
          <li key={s.entryId}>
            <button class="btn" data-testid="suggestion" onClick={() => onPick(ctx.index.byId.get(s.entryId)!)}>
              {s.chinese} {s.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Lookup({ ctx, prefs, onPrefs, flags, onFlag }: Props) {
  const [text, setText] = useState('');
  const [items, setItems] = useState<LookupItem[] | null>(null);
  const [sel, setSel] = useState(0);
  const [seq, setSeq] = useState(false);
  const [peek, setPeek] = useState<LexEntry | null>(null);
  const [focused, setFocused] = useState(false);
  const [hi, setHi] = useState(-1);

  // Complete the longest trailing run of words (up to four) that has matches, so "good b" offers "good bye".
  const { suffix, ta } = useMemo(() => {
    if (!focused || /\s$/.test(text)) return { suffix: '', ta: [] };
    const tokens = text.match(/\S+\s*/g) ?? [];
    for (let k = Math.max(0, tokens.length - 4); k < tokens.length; k++) {
      const suffix = tokens.slice(k).join('');
      const items = typeahead(ctx.index, suffix.trim());
      if (items.length) return { suffix, ta: items };
    }
    return { suffix: '', ta: [] };
  }, [ctx.index, text, focused]);

  const chosen = (it: LookupItem): LexEntry | null => (it.kind === 'sign' ? chooseEntry(it.entries, it.key, prefs) : null);

  const run = (t: string) => {
    const result = lookup(ctx.index, t);
    setItems(result);
    setPeek(null);
    const first = result.findIndex((i) => i.kind === 'sign');
    // A phrase of two or more signs plays through by itself, in typed order; a single sign just loops.
    setSeq(result.filter((i) => i.kind === 'sign').length > 1);
    setSel(first >= 0 ? first : 0);
    setHi(-1);
    const videos = result.flatMap((i) => (i.kind === 'sign' ? [chooseEntry(i.entries, i.key, prefs).video] : []));
    prefetchClips(ctx, videos.slice(0, 6));
  };

  const submit = (e: Event) => {
    e.preventDefault();
    if (hi >= 0 && ta[hi]) {
      accept(ta[hi].label);
      return;
    }
    setFocused(false);
    // Read the field itself: a fast typist's last keystrokes may not have been rendered into `text` yet.
    const field = (e.currentTarget as HTMLFormElement | null)?.querySelector('input');
    run(field ? field.value : text);
  };

  const accept = (label: string) => {
    setText(text.slice(0, text.length - suffix.length) + label);
    setHi(-1);
  };

  const onKey = (e: KeyboardEvent) => {
    if (!ta.length) return;
    if (e.key === 'ArrowDown') (e.preventDefault(), setHi((h) => (h + 1) % ta.length));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setHi((h) => (h <= 0 ? ta.length - 1 : h - 1)));
    else if (e.key === 'Escape') setFocused(false);
  };

  const signIdx = items ? items.map((it, i) => (it.kind === 'sign' ? i : -1)).filter((i) => i >= 0) : [];
  const playAll = () => {
    if (!items || !signIdx.length) return;
    setPeek(null);
    setSel(signIdx[0]);
    setSeq(true);
    prefetchClips(ctx, signIdx.slice(1, 4).map((i) => chosen(items[i])!.video));
  };
  const advance = () => {
    if (!items) return;
    const next = signIdx.find((i) => i > sel);
    if (next === undefined) return setSeq(false);
    setSel(next);
    const after = signIdx.find((i) => i > next);
    if (after !== undefined) prefetchClips(ctx, [chosen(items[after])!.video]);
  };

  const current = items?.[sel];

  return (
    <section aria-labelledby="lookup-h">
      <h1 id="lookup-h">Sign lookup 手語查詢</h1>
      <p class="note" data-testid="grammar-note">
        This looks up dictionary signs in the order you type. It is not a translation: real TSL grammar and word order differ from English.
      </p>

      <form onSubmit={submit} class="lookup-form" role="search">
        <div class="combo">
          <input
            type="text"
            class="input"
            data-testid="lookup-input"
            value={text}
            placeholder="English or 中文, e.g. thank you"
            aria-label="Word or phrase to look up"
            autoComplete="off"
            autoCapitalize="none"
            spellcheck={false}
            role="combobox"
            aria-expanded={ta.length > 0}
            aria-controls="ta-list"
            aria-autocomplete="list"
            aria-activedescendant={hi >= 0 && ta[hi] ? `ta-opt-${hi}` : undefined}
            onInput={(e) => (setText((e.target as HTMLInputElement).value), setHi(-1))}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={onKey}
          />
          {ta.length > 0 && (
            <ul id="ta-list" class="typeahead" role="listbox" data-testid="typeahead">
              {ta.map((t, i) => (
                <li key={t.entryId} role="presentation">
                  <button
                    type="button"
                    role="option"
                    id={`ta-opt-${i}`}
                    tabIndex={-1}
                    aria-selected={i === hi}
                    class={i === hi ? 'hi' : ''}
                    onMouseDown={(e) => (e.preventDefault(), accept(t.label))}
                  >
                    <span lang="zh-Hant">{t.chinese}</span> {t.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button class="btn primary" type="submit" data-testid="lookup-go">
          Look up
        </button>
      </form>

      {!items && (
        <div class="card" data-testid="lookup-empty">
          <h2>Try a word</h2>
          <p class="note">Type English or Chinese. Every word shows the signs the dictionary has for it, or says plainly that it has none.</p>
          <ul class="plain chips-inline">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button class="btn" onClick={() => (setText(ex), run(ex))}>
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {items && items.length === 0 && (
        <p class="note" data-testid="lookup-nothing">
          Nothing to look up yet.
        </p>
      )}

      {items && items.length > 0 && (
        <>
          <ol class="chips" aria-label="Signs in typed order" data-testid="chips">
            {items.map((it, i) => {
              const c = chosen(it);
              const cls = `chip ${it.kind}${i === sel ? ' sel' : ''}`;
              return (
                <li key={i}>
                  <button
                    class={cls}
                    aria-current={i === sel ? 'true' : undefined}
                    data-testid={`chip-${it.kind}`}
                    onClick={() => (setSel(i), setPeek(null), setSeq(false))}
                  >
                    {it.kind === 'sign' && c && (
                      <>
                        <span class="zh" lang="zh-Hant">
                          {c.chinese ?? '—'}
                        </span>
                        <span class="en">{c.english[0]}</span>
                        <span class="meta">
                          {it.entries.length > 1 ? `${it.entries.length} signs` : ''}
                          {viaBadge(it) ? ` ${viaBadge(it)}` : ''}
                        </span>
                      </>
                    )}
                    {it.kind === 'missing' && (
                      <>
                        <span class="zh">∅</span>
                        <span class="en">{it.source}</span>
                        <span class="meta">no sign</span>
                      </>
                    )}
                    {it.kind === 'skipped' && (
                      <>
                        <span class="en">{it.source}</span>
                        <span class="meta">not signed</span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
          {signIdx.length > 1 && (
            <button class="btn" onClick={playAll} data-testid="play-all">
              {seq ? '▶ Playing in order…' : '▶ Play in order'}
            </button>
          )}

          {current?.kind === 'sign' && (
            <div class="panel">
              {current.source !== chosen(current)!.english[0].toLowerCase() && (
                <p class="note" data-testid="typed-as">
                  You typed “{current.source}”
                  {current.via === 'synonym' ? `: the dictionary lists it as a synonym of “${chosen(current)!.english[0]}”.` : '.'}
                </p>
              )}
              <SignDetail
                key={`${sel}-${chosen(current)!.id}-${seq}`}
                ctx={ctx}
                entry={chosen(current)!}
                prefs={prefs}
                onPrefs={onPrefs}
                pinKey={current.key}
                loop={!seq}
                onEnded={seq ? advance : undefined}
              />
            </div>
          )}

          {current?.kind === 'skipped' && (
            <div class="card" data-testid="skipped-panel">
              <h2>“{current.source}” has no sign of its own</h2>
              <p>{current.reason}. It is left out of the sign row.</p>
            </div>
          )}

          {current?.kind === 'missing' && (
            <div class="card" data-testid="missing-panel">
              <h2>No sign found for “{current.source}”</h2>
              <p>The dictionary has no sign for this word, so none is shown rather than a wrong one.</p>
              {current.note && <p class="note">{current.note}</p>}
              <SuggestionList ctx={ctx} suggestions={current.suggestions} onPick={setPeek} />
              <button
                class="btn"
                data-testid="flag-missing"
                disabled={flags.some((f) => f.word === current.source)}
                onClick={() => onFlag(current.source)}
              >
                {flags.some((f) => f.word === current.source) ? '✓ Flagged as missing' : 'Flag as missing'}
              </button>
              {peek && (
                <div class="panel">
                  <SignDetail key={peek.id} ctx={ctx} entry={peek} prefs={prefs} onPrefs={onPrefs} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      <footer class="status">
        <p class="note" data-testid="home-count">
          {ctx.lexicon.entries.length.toLocaleString()} signs ready.
        </p>
        {ctx.notes.map((n) => (
          <p class="note" key={n} data-testid="boot-note">
            {n}
          </p>
        ))}
      </footer>
    </section>
  );
}
