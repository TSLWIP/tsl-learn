import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AppContext } from '../boot/boot.ts';
import { prefetchClips } from '../clips/load.ts';
import type { LexEntry } from '../lexicon/types.ts';
import { siblings } from '../match/index.ts';
import { addConfusion, optionLabel, type Confusions } from '../quiz/distractors.ts';
import { mulberry32, shuffle } from '../quiz/rng.ts';
import { mistakeReview, type ProgressMap } from '../quiz/session.ts';
import { checkTyped } from '../quiz/typed.ts';
import type { Question, QuizLangPref, QuizMode } from '../quiz/types.ts';
import { gradeFromAnswer, schedule } from '../srs/sm2.ts';
import { saveConfusions } from '../state/learning.ts';
import type { Prefs } from '../state/prefs.ts';
import type { Grade } from '../storage/types.ts';
import { cue } from './feedback.ts';
import { MiniClip } from './MiniClip.tsx';
import { SignPlayer } from './SignPlayer.tsx';

export interface Summary {
  /** signs that were graded (first attempt only) */
  total: number;
  /** answered correctly on the first try */
  correct: number;
  missed: LexEntry[];
  graded: { entry: LexEntry; grade: Grade; dueAt: number }[];
  answeredAny: boolean;
}

interface Props {
  ctx: AppContext;
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
  steps: Question[];
  title: string;
  progress: ProgressMap;
  confusions: Confusions;
  langPref: QuizLangPref;
  onDone: (s: Summary) => void;
}

interface Feedback {
  correct: boolean;
  typo?: boolean;
  answer: LexEntry;
  note?: string;
}

const Answer = ({ e }: { e: LexEntry }) => (
  <span class="answer">
    <span lang="zh-Hant">{e.chinese}</span> {e.english[0]}
  </span>
);

export function QuizRunner({ ctx, prefs, setPrefs, steps: initial, title, progress, confusions, langPref, onDone }: Props) {
  const [steps, setSteps] = useState(initial);
  const [idx, setIdx] = useState(0);
  const [fb, setFb] = useState<Feedback | null>(null);
  const results = useRef(new Map<string, Summary['graded'][number] & { correct: boolean }>());
  const missed = useRef<LexEntry[]>([]);
  const reviewAdded = useRef(false);
  const conf = useRef(confusions);
  const rng = useRef(mulberry32(Date.now() >>> 0));

  const q = steps[idx];
  const inReview = !q?.graded && q?.mode === 'sign-to-meaning';

  useEffect(() => {
    const nextQ = steps[idx + 1];
    if (!nextQ) return;
    const entries =
      nextQ.mode === 'matching' ? nextQ.pairs.map((p) => p.entry) : nextQ.mode === 'meaning-to-sign' ? nextQ.options : [nextQ.target];
    prefetchClips(ctx, entries.map((e) => e.video));
  }, [idx, steps, ctx]);

  /** Writes one first-attempt result to the schedule and the review log. */
  const record = async (entry: LexEntry, mode: QuizMode, grade: Grade, correct: boolean, chosen?: LexEntry) => {
    if (results.current.has(entry.id)) return;
    const now = Date.now();
    const next = schedule(progress.get(entry.id), entry.id, grade, now);
    progress.set(entry.id, next);
    results.current.set(entry.id, { entry, grade, dueAt: next.dueAt, correct });
    if (!correct) {
      missed.current.push(entry);
      if (chosen) {
        conf.current = addConfusion(conf.current, entry.id, chosen.id);
        void saveConfusions(ctx.repo, conf.current).catch((e) => ctx.repo?.logError('confusions', e));
      }
    }
    try {
      await ctx.repo?.recordReview({ signId: entry.id, at: now, grade, mode }, next);
    } catch (e) {
      void ctx.repo?.logError('quiz/record', e);
    }
  };

  const finish = () => {
    const all = [...results.current.values()];
    cue('done', prefs);
    onDone({
      total: all.length,
      correct: all.filter((r) => r.correct).length,
      missed: all.filter((r) => !r.correct).map((r) => r.entry),
      graded: all.map(({ entry, grade, dueAt }) => ({ entry, grade, dueAt })),
      answeredAny: all.length > 0,
    });
  };

  const next = () => {
    setFb(null);
    if (idx + 1 < steps.length) return setIdx(idx + 1);
    if (!reviewAdded.current && missed.current.length) {
      reviewAdded.current = true;
      const extra = mistakeReview(missed.current, { index: ctx.index, rng: rng.current, confusions: conf.current, langPref });
      setSteps([...steps, ...extra]);
      setIdx(idx + 1);
      return;
    }
    finish();
  };

  /** A one-answer question: record it (if graded), show feedback. */
  const answer = (correct: boolean, opts: { typo?: boolean; chosen?: LexEntry; note?: string } = {}) => {
    if (!q || q.mode === 'matching') return;
    const target = q.target;
    if (q.graded) void record(target, q.mode, gradeFromAnswer({ correct, typo: opts.typo }), correct, opts.chosen);
    cue(correct ? 'right' : 'wrong', prefs);
    setFb({ correct, typo: opts.typo, answer: target, note: opts.note });
  };

  if (!q) return null;
  const last = idx + 1 >= steps.length && (reviewAdded.current || missed.current.length === 0);

  return (
    <section class="quiz" aria-label={title} data-testid="quiz">
      <h1 class="sr-only">{title}</h1>
      <header class="quiz-head">
        <div>
          <p class="note" data-testid="quiz-progress">
            {inReview ? 'Review of missed signs · ' : `${title} · `}
            {idx + 1} of {steps.length}
          </p>
          <progress max={steps.length} value={idx + (fb ? 1 : 0)} aria-label="Progress" />
        </div>
        <button class="btn" data-testid="end-session" onClick={finish}>
          End
        </button>
      </header>

      {q.mode === 'sign-to-meaning' && (
        <SignToMeaning key={idx} ctx={ctx} q={q} prefs={prefs} setPrefs={setPrefs} fb={fb} onPick={(o) => answer(o.id === q.target.id, { chosen: o })} />
      )}
      {q.mode === 'meaning-to-sign' && <MeaningToSign key={idx} ctx={ctx} q={q} fb={fb} onPick={(o) => answer(o.id === q.target.id, { chosen: o })} />}
      {q.mode === 'typed' && (
        <Typed
          key={idx}
          ctx={ctx}
          q={q}
          prefs={prefs}
          setPrefs={setPrefs}
          fb={fb}
          onSubmit={(text) => {
            const r = checkTyped(q.target, siblings(ctx.index, q.target), text);
            answer(r !== 'wrong', { typo: r === 'typo', note: r === 'typo' ? 'Close enough: check the spelling.' : undefined });
          }}
        />
      )}
      {q.mode === 'flashcard' && (
        <Flashcard
          key={idx}
          ctx={ctx}
          q={q}
          prefs={prefs}
          setPrefs={setPrefs}
          onGrade={(grade) => {
            if (q.graded) void record(q.target, 'flashcard', grade, grade !== 'again');
            cue(grade === 'again' ? 'wrong' : 'right', prefs);
            next();
          }}
          onIntroDone={next}
        />
      )}
      {q.mode === 'matching' && (
        <Matching
          key={idx}
          ctx={ctx}
          q={q}
          fb={fb}
          onComplete={(wrong) => {
            let firstTry = 0;
            for (const p of q.pairs) {
              if (!p.graded) continue;
              const w = wrong.get(p.entry.id) ?? 0;
              if (w === 0) firstTry++;
              void record(p.entry, 'matching', w === 0 ? 'good' : w === 1 ? 'hard' : 'again', w === 0);
            }
            const n = q.pairs.filter((p) => p.graded).length;
            cue(firstTry === n ? 'right' : 'wrong', prefs);
            setFb({ correct: firstTry === n, answer: q.pairs[0].entry, note: `${firstTry} of ${n} matched on the first try.` });
          }}
        />
      )}

      {fb && (
        <div class={`feedback ${fb.correct ? 'right' : 'wrong'}`} role="status" data-testid="feedback">
          <p>
            <strong>{fb.correct ? (fb.typo ? 'Close enough' : 'Correct') : 'Not quite'}</strong>
            {q.mode !== 'matching' && (
              <>
                {' '}
                · <Answer e={fb.answer} />
              </>
            )}
          </p>
          {fb.note && <p class="note">{fb.note}</p>}
          <button class="btn primary" data-testid="next" autoFocus onClick={next}>
            {last ? 'Finish' : 'Next'}
          </button>
        </div>
      )}
    </section>
  );
}

type SetPrefs = (p: Prefs) => void;

function SignToMeaning({ ctx, q, prefs, setPrefs, fb, onPick }: {
  ctx: AppContext; q: Extract<Question, { mode: 'sign-to-meaning' }>; prefs: Prefs; setPrefs: SetPrefs; fb: Feedback | null; onPick: (o: LexEntry) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (!fb && n >= 1 && n <= q.options.length) onPick(q.options[n - 1]);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [fb, q]);
  return (
    <>
      <SignPlayer ctx={ctx} entry={q.target} speed={prefs.speed} onSpeed={(speed) => setPrefs({ ...prefs, speed })} hideLabel />
      <p class="prompt">What does this sign mean?</p>
      <div class="options" role="group" aria-label="Choose the meaning">
        {q.options.map((o, i) => (
          <button
            key={o.id}
            class={`option${fb ? (o.id === q.target.id ? ' right' : ' dim') : ''}`}
            data-testid="option"
            data-correct={o.id === q.target.id}
            disabled={!!fb}
            onClick={() => onPick(o)}
          >
            <span class="num">{i + 1}</span>
            <span lang={q.lang === 'zh' ? 'zh-Hant' : 'en'} class={q.lang === 'zh' ? 'zh' : ''}>
              {optionLabel(o, q.lang)}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function MeaningToSign({ ctx, q, fb, onPick }: {
  ctx: AppContext; q: Extract<Question, { mode: 'meaning-to-sign' }>; fb: Feedback | null; onPick: (o: LexEntry) => void;
}) {
  return (
    <>
      <p class="prompt">
        Which sign is <strong class="big">{q.target.english[0]}</strong>
        {q.target.chinese && (
          <>
            {' '}
            <span class="zh big" lang="zh-Hant">
              {q.target.chinese}
            </span>
          </>
        )}
        ?
      </p>
      <div class="tiles" role="group" aria-label="Choose the sign">
        {q.options.map((o, i) => (
          <button
            key={o.id}
            class={`tile${fb ? (o.id === q.target.id ? ' right' : ' dim') : ''}`}
            data-testid="option"
            data-correct={o.id === q.target.id}
            disabled={!!fb}
            aria-label={fb ? o.english[0] : `Sign ${i + 1}`}
            onClick={() => onPick(o)}
          >
            <MiniClip ctx={ctx} entry={o} label={fb ? `${o.chinese ?? ''} ${o.english[0]}` : `Sign option ${i + 1}`} />
            {fb && <span class="tile-label">{o.english[0]}</span>}
          </button>
        ))}
      </div>
    </>
  );
}

function Typed({ ctx, q, prefs, setPrefs, fb, onSubmit }: {
  ctx: AppContext; q: Extract<Question, { mode: 'typed' }>; prefs: Prefs; setPrefs: SetPrefs; fb: Feedback | null; onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  return (
    <>
      <SignPlayer ctx={ctx} entry={q.target} speed={prefs.speed} onSpeed={(speed) => setPrefs({ ...prefs, speed })} hideLabel />
      <p class="prompt">Type what this sign means (English or 中文).</p>
      <form
        class="lookup-form"
        data-answer={q.target.english[0]}
        onSubmit={(e) => {
          e.preventDefault();
          if (!fb && text.trim()) onSubmit(text);
        }}
      >
        <input
          class="input"
          data-testid="typed-input"
          value={text}
          disabled={!!fb}
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          spellcheck={false}
          aria-label="Your answer"
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
        />
        <button class="btn primary" type="submit" data-testid="typed-check" disabled={!!fb || !text.trim()}>
          Check
        </button>
      </form>
    </>
  );
}

function Flashcard({ ctx, q, prefs, setPrefs, onGrade, onIntroDone }: {
  ctx: AppContext; q: Extract<Question, { mode: 'flashcard' }>; prefs: Prefs; setPrefs: SetPrefs; onGrade: (g: Grade) => void; onIntroDone: () => void;
}) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <SignPlayer ctx={ctx} entry={q.target} speed={prefs.speed} onSpeed={(speed) => setPrefs({ ...prefs, speed })} hideLabel={!shown} />
      {q.intro && <p class="note" data-testid="intro-note">New sign: watch it a few times, then check the meaning.</p>}
      {!shown ? (
        <button class="btn primary" data-testid="reveal" onClick={() => setShown(true)}>
          Show meaning
        </button>
      ) : (
        <div class="card" data-testid="revealed">
          <p class="zh big" lang="zh-Hant">
            {q.target.chinese ?? '—'}
          </p>
          <h2>{q.target.english[0]}</h2>
          {q.target.english.length > 1 && <p class="note">Also: {q.target.english.slice(1).join(', ')}</p>}
          {q.target.description && <p>{q.target.description}</p>}
        </div>
      )}
      {shown && q.intro && (
        <button class="btn primary" data-testid="intro-next" autoFocus onClick={onIntroDone}>
          Got it
        </button>
      )}
      {shown && !q.intro && (
        <div class="grades" role="group" aria-label="How well did you know it?">
          {(['again', 'hard', 'good', 'easy'] as const).map((g) => (
            <button key={g} class="btn" data-testid={`grade-${g}`} onClick={() => onGrade(g)}>
              {g[0].toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function Matching({ ctx, q, fb, onComplete }: {
  ctx: AppContext; q: Extract<Question, { mode: 'matching' }>; fb: Feedback | null; onComplete: (wrong: Map<string, number>) => void;
}) {
  const [clip, setClip] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const wrong = useRef(new Map<string, number>());
  const words = useMemo(() => shuffle(q.pairs, mulberry32(q.pairs.reduce((a, p) => a + p.entry.id.length * 31, 7))), [q]);

  const pickWord = (id: string) => {
    if (!clip || done.has(id)) return;
    if (clip === id) {
      const d = new Set(done).add(id);
      setDone(d);
      setClip(null);
      if (d.size === q.pairs.length) onComplete(wrong.current);
    } else {
      wrong.current.set(clip, (wrong.current.get(clip) ?? 0) + 1);
      setFlash(id);
      setTimeout(() => setFlash(null), 500);
    }
  };

  return (
    <>
      <p class="prompt">Tap a sign, then its meaning.</p>
      <div class="tiles" role="group" aria-label="Signs">
        {q.pairs.map((p, i) => (
          <button
            key={p.entry.id}
            class={`tile${done.has(p.entry.id) ? ' right' : ''}${clip === p.entry.id ? ' sel' : ''}`}
            data-testid="match-clip"
            data-entry={p.entry.id}
            disabled={done.has(p.entry.id) || !!fb}
            aria-pressed={clip === p.entry.id}
            aria-label={`Sign ${i + 1}`}
            onClick={() => setClip(p.entry.id)}
          >
            <MiniClip ctx={ctx} entry={p.entry} label={done.has(p.entry.id) ? p.entry.english[0] : `Sign ${i + 1}`} />
          </button>
        ))}
      </div>
      <div class="options" role="group" aria-label="Meanings">
        {words.map((p) => (
          <button
            key={p.entry.id}
            class={`option${done.has(p.entry.id) ? ' right' : ''}${flash === p.entry.id ? ' wrong' : ''}`}
            data-testid="match-word"
            data-entry={p.entry.id}
            disabled={done.has(p.entry.id) || !!fb}
            onClick={() => pickWord(p.entry.id)}
          >
            <span class="zh" lang="zh-Hant">
              {p.entry.chinese}
            </span>{' '}
            {p.entry.english[0]}
          </button>
        ))}
      </div>
    </>
  );
}
