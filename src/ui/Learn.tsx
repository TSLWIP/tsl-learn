import { useEffect, useMemo, useState } from 'preact/hooks';
import type { AppContext } from '../boot/boot.ts';
import { mulberry32 } from '../quiz/rng.ts';
import {
  buildQuestions, deckUnits, groupUnits, newBudget, selectDue, selectNew, selectPractice, type ProgressMap, type SessionMode,
} from '../quiz/session.ts';
import type { Confusions } from '../quiz/distractors.ts';
import type { Question, Unit } from '../quiz/types.ts';
import { loadConfusions, loadProgress, makeDeck } from '../state/learning.ts';
import type { MissingFlag, Prefs } from '../state/prefs.ts';
import type { Deck } from '../storage/types.ts';
import { formatWhen } from './format.ts';
import { QuizRunner, type Summary } from './QuizRunner.tsx';

const MODES: { id: SessionMode; label: string }[] = [
  { id: 'mixed', label: 'Mixed' },
  { id: 'sign-to-meaning', label: 'Sign → meaning' },
  { id: 'meaning-to-sign', label: 'Meaning → sign' },
  { id: 'typed', label: 'Type it' },
  { id: 'matching', label: 'Matching' },
  { id: 'flashcard', label: 'Flashcards' },
];
const LENGTHS = [5, 10, 20];

interface Session {
  steps: Question[];
  title: string;
}

export function Learn({ ctx, prefs, onPrefs }: { ctx: AppContext; prefs: Prefs; onPrefs: (p: Prefs) => void; flags: MissingFlag[] }) {
  const [progress, setProgress] = useState<ProgressMap | null>(null);
  const [confusions, setConfusions] = useState<Confusions>({});
  const [decks, setDecks] = useState<Deck[]>([]);
  const [pool, setPool] = useState('starter');
  const [mode, setMode] = useState<SessionMode>('mixed');
  const [length, setLength] = useState(10);
  const [session, setSession] = useState<Session | null>(null);
  const [summary, setSummary] = useState<{ s: Summary; at: number } | null>(null);
  const [notice, setNotice] = useState('');
  const [deckName, setDeckName] = useState('');
  const [openDeck, setOpenDeck] = useState<string | null>(null);

  const reload = async () => {
    const [p, c, d] = await Promise.all([loadProgress(ctx.repo), loadConfusions(ctx.repo), ctx.repo?.allDecks() ?? Promise.resolve([])]);
    setProgress(p);
    setConfusions(c);
    setDecks(d);
  };
  useEffect(() => void reload().catch((e) => ctx.repo?.logError('learn/load', e)), []);

  const units: Unit[] = useMemo(() => {
    const all = ctx.lexicon.entries;
    if (pool === 'all') return groupUnits(ctx.index, all, prefs);
    if (pool === 'starter') return groupUnits(ctx.index, all.filter((e) => e.category !== 'more'), prefs);
    if (pool.startsWith('cat:')) return groupUnits(ctx.index, all.filter((e) => e.category === pool.slice(4)), prefs);
    const deck = decks.find((d) => `deck:${d.id}` === pool);
    return deck ? deckUnits(ctx.index, deck) : [];
  }, [ctx, pool, prefs, decks]);

  if (session && progress) {
    return (
      <QuizRunner
        ctx={ctx}
        prefs={prefs}
        setPrefs={onPrefs}
        steps={session.steps}
        title={session.title}
        progress={progress}
        confusions={confusions}
        langPref={prefs.quizLang}
        onDone={(s) => {
          setSession(null);
          setSummary({ s, at: Date.now() });
          void reload();
        }}
      />
    );
  }

  if (summary) return <SummaryView ctx={ctx} {...summary} onClose={() => setSummary(null)} />;

  const now = Date.now();
  const due = progress ? selectDue(units, progress, now) : [];
  const fresh = progress ? selectNew(units, progress) : [];
  const budget = progress ? newBudget(progress, prefs.newPerDay, now) : 0;
  const learnable = Math.min(budget, fresh.length);

  const opts = (intro = false) => ({ index: ctx.index, rng: mulberry32(now >>> 0), confusions, langPref: prefs.quizLang, intro });
  const start = (kind: 'review' | 'learn' | 'quick') => {
    if (!progress) return;
    setNotice('');
    let targets: Unit[];
    if (kind === 'review') targets = due.slice(0, length);
    else if (kind === 'learn') targets = fresh.slice(0, Math.min(budget, length));
    else targets = selectPractice(units, progress, now, 5, mulberry32((now >>> 0) + 1));
    if (!targets.length) {
      setNotice(kind === 'review' ? 'Nothing is due right now.' : kind === 'learn' ? 'No new signs to learn here today.' : 'This deck has no signs yet.');
      return;
    }
    const steps = buildQuestions(targets, kind === 'learn' && mode === 'matching' ? 'mixed' : mode, opts(kind === 'learn'));
    setSession({ steps, title: kind === 'review' ? 'Review' : kind === 'learn' ? 'Learn new' : 'Quick round' });
  };

  const createDeck = async (e: Event) => {
    e.preventDefault();
    if (!deckName.trim() || !ctx.repo) return;
    await ctx.repo.putDeck(makeDeck(deckName));
    setDeckName('');
    await reload();
  };
  const removeDeck = async (d: Deck) => {
    if (!ctx.repo || !confirm(`Delete the deck “${d.name}”? Your progress on its signs is kept.`)) return;
    await ctx.repo.deleteDeck(d.id);
    if (pool === `deck:${d.id}`) setPool('starter');
    await reload();
  };
  const removeFromDeck = async (d: Deck, id: string) => {
    await ctx.repo?.putDeck({ ...d, signIds: d.signIds.filter((x) => x !== id) });
    await reload();
  };

  const cats = ctx.lexicon.categories.filter((c) => c.id !== 'more');
  const firstTime = progress && progress.size === 0;

  return (
    <section aria-labelledby="learn-h">
      <h1 id="learn-h">Learn 學習</h1>
      <p class="note">Short rounds, spaced out over time. Signs you miss come back sooner.</p>

      {notice && (
        <p class="note" role="status" data-testid="learn-notice">
          {notice}
        </p>
      )}

      <div class="start-cards">
        <button class="card start" data-testid="start-review" disabled={!progress} onClick={() => start('review')}>
          <strong>Review due</strong>
          <span data-testid="due-count">{due.length} due</span>
        </button>
        <button class={`card start${firstTime ? ' hl' : ''}`} data-testid="start-learn" disabled={!progress} onClick={() => start('learn')}>
          <strong>Learn new</strong>
          <span data-testid="new-count">{learnable} available today</span>
        </button>
        <button class="card start" data-testid="start-quick" disabled={!progress} onClick={() => start('quick')}>
          <strong>Quick round</strong>
          <span>5 questions</span>
        </button>
      </div>

      <div class="card">
        <h2>Choose what to study</h2>
        <label class="field">
          Signs
          <select class="input" data-testid="pool-select" value={pool} onChange={(e) => setPool((e.target as HTMLSelectElement).value)}>
            <option value="starter">Starter topics</option>
            {cats.map((c) => (
              <option key={c.id} value={`cat:${c.id}`}>
                {c.en} {c.zh}
              </option>
            ))}
            {decks.map((d) => (
              <option key={d.id} value={`deck:${d.id}`}>
                My deck: {d.name} ({d.signIds.length})
              </option>
            ))}
            <option value="all">Every sign in the dictionary</option>
          </select>
        </label>
        <p class="note" data-testid="pool-size">
          {units.length} {units.length === 1 ? 'sign' : 'signs'} in this set
        </p>
        <div role="group" aria-label="Question style" class="cats wrap">
          {MODES.map((m) => (
            <button key={m.id} class="btn" aria-pressed={mode === m.id} data-testid={`mode-${m.id}`} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Questions per session" class="cats wrap">
          {LENGTHS.map((n) => (
            <button key={n} class="btn" aria-pressed={length === n} data-testid={`length-${n}`} onClick={() => setLength(n)}>
              {n} questions
            </button>
          ))}
        </div>
      </div>

      <div class="card" data-testid="decks-card">
        <h2>My decks</h2>
        {decks.length === 0 && <p class="note">Make a deck of your own, then add signs to it from the lookup or library screens.</p>}
        <ul class="plain">
          {decks.map((d) => (
            <li key={d.id} class="deck-row">
              <button class="link" aria-expanded={openDeck === d.id} onClick={() => setOpenDeck(openDeck === d.id ? null : d.id)}>
                {d.name} · {d.signIds.length}
              </button>
              <button class="btn" data-testid={`delete-deck-${d.name}`} onClick={() => removeDeck(d)}>
                Delete
              </button>
              {openDeck === d.id && (
                <ul class="plain deck-signs">
                  {d.signIds.length === 0 && <li class="note">Empty.</li>}
                  {d.signIds.map((id) => {
                    const e = ctx.index.byId.get(id);
                    return e ? (
                      <li key={id}>
                        <span lang="zh-Hant">{e.chinese}</span> {e.english[0]}{' '}
                        <button class="link" onClick={() => removeFromDeck(d, id)} aria-label={`Remove ${e.english[0]}`}>
                          Remove
                        </button>
                      </li>
                    ) : null;
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {ctx.repo && (
          <form onSubmit={createDeck} class="lookup-form">
            <input class="input" data-testid="deck-name" value={deckName} maxLength={40} placeholder="New deck name" aria-label="New deck name" onInput={(e) => setDeckName((e.target as HTMLInputElement).value)} />
            <button class="btn" type="submit" data-testid="deck-create">
              Create
            </button>
          </form>
        )}
      </div>

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

function SummaryView({ ctx, s, at, onClose }: { ctx: AppContext; s: Summary; at: number; onClose: () => void }) {
  const soonest = s.graded.length ? Math.min(...s.graded.map((g) => g.dueAt)) : null;
  const ratio = s.total ? s.correct / s.total : 0;
  const headline = !s.answeredAny ? 'Session ended' : ratio === 1 ? 'Perfect round' : ratio >= 0.6 ? 'Nice work' : 'Good practice';
  return (
    <section class="card summary" data-testid="summary" aria-labelledby="sum-h">
      <h1 id="sum-h">{headline}</h1>
      {s.answeredAny ? (
        <>
          <p class="score" data-testid="score">
            {s.correct} <span class="note">of {s.total} on the first try</span>
          </p>
          {s.missed.length > 0 ? (
            <div data-testid="missed-list">
              <p>These will come back soon:</p>
              <ul class="plain">
                {s.missed.map((e) => (
                  <li key={e.id}>
                    <span lang="zh-Hant">{e.chinese}</span> {e.english[0]}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p>You got every sign right first time.</p>
          )}
          {soonest !== null && <p class="note">Next review {formatWhen(soonest, at)}.</p>}
        </>
      ) : (
        <p class="note">No answers were recorded this time.</p>
      )}
      <button class="btn primary" data-testid="summary-done" onClick={onClose}>
        Done
      </button>
      {ctx.repo === null && <p class="note">Progress could not be saved in this browser session.</p>}
    </section>
  );
}
