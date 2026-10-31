import { useState } from 'preact/hooks';
import type { AppContext } from '../boot/boot.ts';
import type { LexEntry } from '../lexicon/types.ts';
import { siblings } from '../match/index.ts';
import { normalizeText } from '../match/normalize.ts';
import type { Prefs, Speed } from '../state/prefs.ts';
import { AddToDeck } from './AddToDeck.tsx';
import { SignPictures } from './SignPictures.tsx';
import { SignPlayer } from './SignPlayer.tsx';

export const DIALECT_LABEL = {
  north: 'Northern (Taipei) 北部',
  south: 'Southern (Tainan) 南部',
  both: 'Both dialects 通用',
} as const;

export function variantName(e: LexEntry): string {
  const parts: string[] = [];
  if (e.dialect !== 'both') parts.push(e.dialect === 'north' ? 'Northern' : 'Southern');
  if (e.senseLabel) parts.push(e.senseLabel);
  return parts.join(' · ') || 'Standard';
}

interface Props {
  ctx: AppContext;
  entry: LexEntry;
  prefs: Prefs;
  onPrefs: (p: Prefs) => void;
  loop?: boolean;
  onEnded?: () => void;
  /** key used for pinning; defaults to the entry's primary English gloss */
  pinKey?: string;
}

export function SignDetail({ ctx, entry, prefs, onPrefs, loop = true, onEnded, pinKey }: Props) {
  const [currentId, setCurrentId] = useState(entry.id);
  const current = ctx.index.byId.get(currentId) ?? entry;
  const variants = siblings(ctx.index, current);
  const key = pinKey ?? normalizeText(current.english[0] ?? '');
  const pinned = prefs.pins[key] === current.id;
  const category = ctx.lexicon.categories.find((c) => c.id === current.category);

  const togglePin = () => {
    const pins = { ...prefs.pins };
    if (pinned) delete pins[key];
    else pins[key] = current.id;
    onPrefs({ ...prefs, pins });
  };

  return (
    <article class="detail" data-testid="sign-detail" aria-label={`${current.english[0]} sign`}>
      <SignPlayer
        ctx={ctx}
        entry={current}
        speed={prefs.speed}
        onSpeed={(speed: Speed) => onPrefs({ ...prefs, speed })}
        loop={loop}
        onEnded={onEnded}
      />
      <SignPictures ctx={ctx} entryId={current.id} />
      <header>
        <p class="zh" lang="zh-Hant" data-testid="detail-zh">
          {current.chinese ?? '—'}
        </p>
        <h2 data-testid="detail-en">{current.english[0]}</h2>
        {current.english.length > 1 && <p class="note">Also: {current.english.slice(1).join(', ')}</p>}
      </header>
      <p>
        <span class="badge" data-testid="detail-dialect">
          {DIALECT_LABEL[current.dialect]}
        </span>
        {current.senseLabel && <span class="badge">{current.senseLabel}</span>}
        {category && current.category !== 'more' && (
          <span class="badge">
            {category.en} {category.zh}
          </span>
        )}
      </p>
      {current.description && (
        <p data-testid="detail-description">
          <strong>How it is made: </strong>
          {current.description}
        </p>
      )}

      {variants.length > 1 && (
        <section aria-label="Other signs for this word">
          <h3>{variants.length} signs for “{current.english[0]}”</h3>
          <ul class="plain variants">
            {variants.map((v) => (
              <li key={v.id}>
                <button
                  class="btn"
                  aria-pressed={v.id === current.id}
                  data-testid={`variant-${v.id}`}
                  onClick={() => setCurrentId(v.id)}
                >
                  {variantName(v)}
                  {prefs.pins[key] === v.id ? ' ★' : ''}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {variants.length > 1 && (
        <button class="btn" aria-pressed={pinned} data-testid="pin" onClick={togglePin}>
          {pinned ? '★ Preferred sign for this word' : '☆ Prefer this sign for this word'}
        </button>
      )}
      <AddToDeck ctx={ctx} entry={current} />
      <p class="note credit">
        Clip and gloss: <a href={current.sourceUrl} target="_blank" rel="noreferrer">TSL Online Dictionary</a>, National Chung Cheng University.
      </p>
    </article>
  );
}
