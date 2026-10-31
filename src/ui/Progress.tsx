import { useEffect, useMemo, useState } from 'preact/hooks';
import type { AppContext } from '../boot/boot.ts';
import {
  accuracy, activeDays, categoryCompletion, lastDays, masteryCounts, shouldRemindExport, streak, todayCount, troubleSpots,
} from '../progress/stats.ts';
import { groupUnits } from '../quiz/session.ts';
import type { Unit } from '../quiz/types.ts';
import { loadProgress } from '../state/learning.ts';
import type { Prefs } from '../state/prefs.ts';
import { downloadBackup } from '../storage/download.ts';
import type { ReviewEvent, SignProgress } from '../storage/types.ts';

interface Data {
  progress: Map<string, SignProgress>;
  reviews: ReviewEvent[];
  lastExportAt?: number;
  remindedAt?: number;
}

export async function loadActivity(ctx: AppContext): Promise<Data> {
  const [progress, reviews, lastExportAt, remindedAt] = await Promise.all([
    loadProgress(ctx.repo),
    ctx.repo?.allReviews() ?? Promise.resolve([]),
    ctx.repo?.getMeta<number>('lastExportAt'),
    ctx.repo?.getMeta<number>('exportRemindedAt'),
  ]);
  return { progress, reviews, lastExportAt, remindedAt };
}

export function BackupReminder({ ctx, data, onChange }: { ctx: AppContext; data: Data; onChange: () => void }) {
  const [saved, setSaved] = useState(false);
  if (!ctx.repo) return null;
  const show = shouldRemindExport({ reviewCount: data.reviews.length, lastExportAt: data.lastExportAt, remindedAt: data.remindedAt, now: Date.now() });
  if (!show || saved) return null;
  return (
    <div class="card soft" data-testid="backup-reminder" role="region" aria-label="Backup reminder">
      <p>
        <strong>Keep your progress safe.</strong> It is stored only on this device, and browsers can clear it. A backup file takes a second.
      </p>
      <button
        class="btn primary"
        data-testid="reminder-export"
        onClick={async () => {
          await downloadBackup(ctx.repo!);
          setSaved(true);
          onChange();
        }}
      >
        Save a backup
      </button>
      <button
        class="btn"
        data-testid="reminder-later"
        onClick={async () => {
          await ctx.repo!.setMeta('exportRemindedAt', Date.now());
          setSaved(true);
          onChange();
        }}
      >
        Later
      </button>
    </div>
  );
}

function WeekChart({ bars }: { bars: ReturnType<typeof lastDays> }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div data-testid="week">
      <ul class="week" aria-hidden="true">
        {bars.map((b) => (
          <li key={b.key} class={b.today ? 'today' : ''} title={`${b.label}: ${b.count} ${b.count === 1 ? 'answer' : 'answers'}`}>
            <span class="count">{b.count || ''}</span>
            <span class="bar" style={{ height: `${b.count ? Math.max(6, Math.round((b.count / max) * 90)) : 2}px` }} />
            <span class="day">{b.today ? 'Today' : b.label}</span>
          </li>
        ))}
      </ul>
      {/* the same numbers as a table, for screen readers */}
      <table class="sr-only">
        <caption>Answers per day, last 7 days</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Answers</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((b) => (
            <tr key={b.key}>
              <td>{b.today ? 'Today' : b.label}</td>
              <td>{b.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Progress({ ctx, prefs }: { ctx: AppContext; prefs: Prefs }) {
  const [data, setData] = useState<Data | null>(null);
  const reload = () => void loadActivity(ctx).then(setData).catch((e) => ctx.repo?.logError('progress/load', e));
  useEffect(reload, []);

  const topical = useMemo(() => {
    const by = new Map<string, Unit[]>();
    for (const c of ctx.lexicon.categories) {
      by.set(c.id, groupUnits(ctx.index, ctx.lexicon.entries.filter((e) => e.category === c.id), prefs));
    }
    return by;
  }, [ctx, prefs]);

  if (!data) return <p role="status">Loading your progress…</p>;

  const now = Date.now();
  const { progress, reviews } = data;
  const today = todayCount(reviews, now);
  const run = streak(activeDays(reviews), now);
  // The starter topics, each word once (a word whose variants sit in two categories must not count twice).
  const starterUnits = new Map<string, Unit>();
  for (const [id, units] of topical) if (id !== 'more') for (const u of units) starterUnits.set(u.entry.id, u);
  const allUnits = [...starterUnits.values()];
  const m = masteryCounts(allUnits, progress);
  const acc = accuracy(reviews, now);
  const cats = categoryCompletion(ctx.lexicon.categories.filter((c) => c.id !== 'more'), topical, progress);
  const trouble = troubleSpots(progress);
  const met = progress.size;

  if (reviews.length === 0) {
    return (
      <section aria-labelledby="prog-h">
        <h1 id="prog-h">Progress 進度</h1>
        <div class="card" data-testid="progress-empty">
          <h2>Nothing here yet</h2>
          <p>Your streak, topics and mastery will show up after your first session. Try “Learn new” on the Learn tab: five signs take about three minutes.</p>
        </div>
      </section>
    );
  }

  const segs = [
    { k: 'new', label: 'New', n: m.new, color: 'var(--track)' },
    { k: 'learning', label: 'Learning', n: m.learning, color: 'var(--m1)' },
    { k: 'young', label: 'Getting familiar', n: m.young, color: 'var(--m2)' },
    { k: 'mature', label: 'Well known', n: m.mature, color: 'var(--m3)' },
  ];
  const total = Math.max(1, segs.reduce((a, s) => a + s.n, 0));

  return (
    <section aria-labelledby="prog-h">
      <h1 id="prog-h">Progress 進度</h1>
      <BackupReminder ctx={ctx} data={data} onChange={reload} />

      <div class="card" data-testid="today-card">
        <h2>Today</h2>
        <progress max={prefs.dailyGoal} value={Math.min(today, prefs.dailyGoal)} aria-label="Daily goal" />
        <p data-testid="today-text">
          {today} of {prefs.dailyGoal} answers{today >= prefs.dailyGoal ? ' · goal reached' : ''}
        </p>
      </div>

      <div class="card" data-testid="streak-card">
        <h2>Practice run</h2>
        {run > 0 ? (
          <>
            <p class="score" data-testid="streak">
              {run} <span class="note">{run === 1 ? 'day' : 'days'}</span>
            </p>
            <p class="note">Missing a single day does not break your run.</p>
          </>
        ) : (
          <p data-testid="streak">A fresh start: one short session today begins a new run.</p>
        )}
      </div>

      <div class="card">
        <h2>This week</h2>
        <WeekChart bars={lastDays(reviews, now)} />
      </div>

      <div class="card" data-testid="mastery-card">
        <h2>How well you know the starter topics</h2>
        <div class="stack" role="img" aria-label={segs.map((s) => `${s.label}: ${s.n}`).join(', ')}>
          {segs.map((s) => (
            <span key={s.k} style={{ flexGrow: s.n, background: s.color, display: s.n ? 'block' : 'none' }} data-seg={s.k} />
          ))}
        </div>
        <dl class="legend" data-testid="mastery">
          {segs.map((s) => (
            <div key={s.k}>
              <dt>
                <span class="swatch" style={{ background: s.color }} /> {s.label}
              </dt>
              <dd data-testid={`mastery-${s.k}`}>
                {s.n} <span class="note">({Math.round((s.n / total) * 100)}%)</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div class="card" data-testid="topics-card">
        <h2>Topics</h2>
        <ul class="plain topics">
          {cats.map((c) => (
            <li key={c.id} data-testid={`topic-${c.id}`}>
              <span>
                {c.en} <span lang="zh-Hant">{c.zh}</span>
              </span>
              <span class="note">
                {c.known} known · {c.seen} met · {c.total} signs
              </span>
              <span class="meter" aria-hidden="true">
                <span class="seen" style={{ width: `${c.total ? (c.seen / c.total) * 100 : 0}%` }} />
                <span class="known" style={{ width: `${c.total ? (c.known / c.total) * 100 : 0}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </div>

      {trouble.length > 0 && (
        <div class="card" data-testid="trouble-card">
          <h2>Worth another look</h2>
          <ul class="plain">
            {trouble.map((p) => {
              const e = ctx.index.byId.get(p.id);
              return e ? (
                <li key={p.id}>
                  <span lang="zh-Hant">{e.chinese}</span> {e.english[0]} <span class="note">· forgotten {p.lapses}×</span>
                </li>
              ) : null;
            })}
          </ul>
        </div>
      )}

      <div class="card">
        <h2>Totals</h2>
        <dl>
          <dt>Answers</dt>
          <dd data-testid="total-answers">{reviews.length.toLocaleString()}</dd>
          <dt>Signs met</dt>
          <dd>{met}</dd>
          <dt>Right in the last 30 days</dt>
          <dd>{acc.total ? `${Math.round((acc.right / acc.total) * 100)}% of ${acc.total}` : '—'}</dd>
        </dl>
      </div>
    </section>
  );
}
