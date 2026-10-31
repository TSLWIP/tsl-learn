import type { LexCategory } from '../lexicon/types.ts';
import type { Unit } from '../quiz/types.ts';
import { masteryLevel } from '../srs/sm2.ts';
import type { SignProgress } from '../storage/types.ts';

const DAY = 86_400_000;

/** Local calendar day, e.g. "2026-06-10". Streaks follow the learner's own midnight, not UTC. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function shiftDay(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days); // calendar arithmetic: safe across daylight-saving changes
  return d.getTime();
}

export const activeDays = (reviews: { at: number }[]): Set<string> => new Set(reviews.map((r) => dayKey(r.at)));

/**
 * Number of days practised in the current run. Kind by design:
 *  - today not being finished yet is never a miss;
 *  - one missed day inside a run does not break it (it just does not add to it);
 *  - only two missed days in a row end the run, and the next session simply starts a new one.
 */
export function streak(active: Set<string>, now: number): number {
  let count = 0;
  let misses = 0;
  for (let i = 0; i < 400; i++) {
    const t = shiftDay(now, -i);
    if (active.has(dayKey(t))) {
      count++;
      misses = 0;
    } else if (i > 0) {
      misses++;
      if (misses >= 2) break;
    }
  }
  return count;
}

export interface DayBar {
  key: string;
  label: string;
  count: number;
  today: boolean;
}

/** Answers per day for the last `n` days, oldest first. */
export function lastDays(reviews: { at: number }[], now: number, n = 7): DayBar[] {
  const counts = new Map<string, number>();
  for (const r of reviews) counts.set(dayKey(r.at), (counts.get(dayKey(r.at)) ?? 0) + 1);
  return Array.from({ length: n }, (_, i) => {
    const t = shiftDay(now, i - (n - 1));
    const key = dayKey(t);
    return {
      key,
      label: new Date(t).toLocaleDateString('en', { weekday: 'short' }),
      count: counts.get(key) ?? 0,
      today: i === n - 1,
    };
  });
}

export const todayCount = (reviews: { at: number }[], now: number): number => {
  const k = dayKey(now);
  return reviews.filter((r) => dayKey(r.at) === k).length;
};

export function accuracy(reviews: { at: number; grade: string }[], now: number, days = 30): { total: number; right: number } {
  const since = now - days * DAY;
  const recent = reviews.filter((r) => r.at >= since);
  return { total: recent.length, right: recent.filter((r) => r.grade !== 'again').length };
}

export interface MasteryCounts {
  new: number;
  learning: number;
  young: number;
  mature: number;
}

export function masteryCounts(units: Unit[], progress: Map<string, SignProgress>): MasteryCounts {
  const out: MasteryCounts = { new: 0, learning: 0, young: 0, mature: 0 };
  for (const u of units) {
    const lvl = masteryLevel(progress.get(u.entry.id));
    out[(['new', 'learning', 'young', 'mature'] as const)[lvl]]++;
  }
  return out;
}

export interface CategoryProgress extends LexCategory {
  total: number;
  /** signs met at least once */
  seen: number;
  /** signs with a review interval of 6 days or more */
  known: number;
}

export function categoryCompletion(
  categories: LexCategory[],
  unitsByCategory: Map<string, Unit[]>,
  progress: Map<string, SignProgress>,
): CategoryProgress[] {
  return categories.map((c) => {
    const units = unitsByCategory.get(c.id) ?? [];
    const m = masteryCounts(units, progress);
    return { ...c, total: units.length, seen: units.length - m.new, known: m.young + m.mature };
  });
}

/** Signs that have been forgotten most often, for a "needs another look" list. */
export function troubleSpots(progress: Map<string, SignProgress>, limit = 5): SignProgress[] {
  return [...progress.values()]
    .filter((p) => p.lapses > 0)
    .sort((a, b) => b.lapses - a.lapses || a.ease - b.ease)
    .slice(0, limit);
}

const REMIND_AFTER = 30 * DAY;
const REMIND_AGAIN = 14 * DAY;
const MIN_REVIEWS = 50;

/**
 * Backup reminder, shown as a quiet card (never a popup): once there is something worth saving, no recent backup,
 * and the learner has not said "later" in the last two weeks.
 */
export function shouldRemindExport(o: { reviewCount: number; lastExportAt?: number; remindedAt?: number; now: number }): boolean {
  if (o.reviewCount < MIN_REVIEWS) return false;
  if (o.remindedAt !== undefined && o.now - o.remindedAt < REMIND_AGAIN) return false;
  return o.lastExportAt === undefined || o.now - o.lastExportAt >= REMIND_AFTER;
}
