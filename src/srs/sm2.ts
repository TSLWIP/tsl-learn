import type { Grade, SignProgress } from '../storage/types.ts';

export const DAY = 86_400_000;
export const AGAIN_DELAY = 10 * 60_000;
export const MIN_EASE = 1.3;
export const START_EASE = 2.5;

export function newProgress(id: string, now: number): SignProgress {
  return { id, schemaVersion: 2, ease: START_EASE, intervalDays: 0, dueAt: now, reps: 0, lapses: 0, introducedAt: now };
}

export function isDue(p: SignProgress, now: number): boolean {
  return p.dueAt <= now;
}

/**
 * SM-2 with four grades. Deterministic: the same progress, grade and clock always give the same result.
 *  again: back to the start, due again in 10 minutes, ease drops
 *  hard:  interval grows slowly, ease drops a little
 *  good:  1 day, then 6 days, then interval x ease
 *  easy:  a longer first steps, interval x ease x 1.3, ease rises
 */
export function schedule(prev: SignProgress | undefined, id: string, grade: Grade, now: number): SignProgress {
  const p = prev ?? newProgress(id, now);
  const next: SignProgress = { ...p, schemaVersion: 2 };
  switch (grade) {
    case 'again':
      next.lapses = p.reps > 0 ? p.lapses + 1 : p.lapses;
      next.reps = 0;
      next.intervalDays = 0;
      next.ease = Math.max(MIN_EASE, p.ease - 0.2);
      next.dueAt = now + AGAIN_DELAY;
      return next;
    case 'hard':
      next.intervalDays = p.reps === 0 ? 1 : Math.max(p.intervalDays + 1, Math.round(p.intervalDays * 1.2));
      next.ease = Math.max(MIN_EASE, p.ease - 0.15);
      break;
    case 'good':
      next.intervalDays = p.reps === 0 ? 1 : p.reps === 1 ? 6 : Math.max(p.intervalDays + 1, Math.round(p.intervalDays * p.ease));
      break;
    case 'easy':
      next.intervalDays = p.reps === 0 ? 3 : p.reps === 1 ? 8 : Math.max(p.intervalDays + 2, Math.round(p.intervalDays * p.ease * 1.3));
      next.ease = p.ease + 0.15;
      break;
  }
  next.reps = p.reps + 1;
  next.dueAt = now + next.intervalDays * DAY;
  return next;
}

/** Quiz answers map to grades; a typo or a second attempt is "hard". */
export function gradeFromAnswer(r: { correct: boolean; typo?: boolean }): Grade {
  if (!r.correct) return 'again';
  return r.typo ? 'hard' : 'good';
}

/** 0 = new, 1 = learning, 2 = young, 3 = mature (21+ days) */
export function masteryLevel(p: SignProgress | undefined): 0 | 1 | 2 | 3 {
  if (!p || p.reps === 0) return p ? 1 : 0;
  return p.intervalDays >= 21 ? 3 : p.intervalDays >= 6 ? 2 : 1;
}

export function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
