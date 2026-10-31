import { describe, expect, it } from 'vitest';
import { AGAIN_DELAY, DAY, MIN_EASE, gradeFromAnswer, isDue, masteryLevel, newProgress, schedule, startOfLocalDay } from '../src/srs/sm2.ts';
import type { Grade, SignProgress } from '../src/storage/types.ts';

const T0 = Date.UTC(2026, 0, 1, 12);

const run = (grades: Grade[], start?: SignProgress, t0 = T0) => {
  let p = start;
  let now = t0;
  const log: SignProgress[] = [];
  for (const g of grades) {
    p = schedule(p, 'x', g, now);
    log.push(p);
    now = p.dueAt; // review exactly when it falls due
  }
  return log;
};

describe('SM-2 scheduler', () => {
  it('a new sign answered "good" comes back in 1 day, then 6, then interval x ease', () => {
    const [a, b, c] = run(['good', 'good', 'good']);
    expect(a.intervalDays).toBe(1);
    expect(b.intervalDays).toBe(6);
    expect(c.intervalDays).toBe(Math.round(6 * 2.5));
    expect(a.dueAt).toBe(T0 + DAY);
    expect(c.reps).toBe(3);
  });

  it('"again" resets to a 10 minute retry, counts a lapse only for known signs, and lowers ease', () => {
    const [first] = run(['again']);
    expect(first).toMatchObject({ reps: 0, intervalDays: 0, lapses: 0, dueAt: T0 + AGAIN_DELAY });
    const log = run(['good', 'good', 'again']);
    expect(log[2]).toMatchObject({ reps: 0, intervalDays: 0, lapses: 1 });
    expect(log[2].ease).toBeCloseTo(2.3);
  });

  it('ease never drops below the floor', () => {
    let p = schedule(undefined, 'x', 'good', T0);
    for (let i = 0; i < 20; i++) p = schedule(p, 'x', 'again', T0);
    expect(p.ease).toBe(MIN_EASE);
  });

  it('hard grows slowly and lowers ease; easy grows fast and raises ease', () => {
    const base = run(['good', 'good'])[1];
    const hard = schedule(base, 'x', 'hard', base.dueAt);
    const good = schedule(base, 'x', 'good', base.dueAt);
    const easy = schedule(base, 'x', 'easy', base.dueAt);
    expect(hard.intervalDays).toBeLessThan(good.intervalDays);
    expect(easy.intervalDays).toBeGreaterThan(good.intervalDays);
    expect(hard.ease).toBeLessThan(base.ease);
    expect(easy.ease).toBeGreaterThan(base.ease);
  });

  it('intervals always move forward by at least a day for successful reviews', () => {
    let p = run(['good', 'good'])[1];
    p = { ...p, ease: MIN_EASE, intervalDays: 1 };
    for (const g of ['hard', 'good'] as const) expect(schedule(p, 'x', g, p.dueAt).intervalDays).toBeGreaterThanOrEqual(2);
  });

  it('extra practice before a sign is due does not grow its interval', () => {
    const learned = schedule(undefined, 'x', 'good', T0); // due in 1 day
    for (const g of ['good', 'easy', 'hard'] as const) {
      expect(schedule(learned, 'x', g, T0 + 3_600_000), `early ${g}`).toEqual(learned);
    }
    // ten quick rounds in one afternoon change nothing
    let p = learned;
    for (let i = 0; i < 10; i++) p = schedule(p, 'x', 'good', T0 + i * 60_000);
    expect(p).toEqual(learned);
  });

  it('a miss during early practice still resets the sign', () => {
    const known = run(['good', 'good'])[1]; // interval 6 days
    const miss = schedule(known, 'x', 'again', known.dueAt - 2 * DAY);
    expect(miss).toMatchObject({ reps: 0, intervalDays: 0, lapses: 1 });
    expect(miss.dueAt).toBe(known.dueAt - 2 * DAY + AGAIN_DELAY);
  });

  it('once it is due, a good answer advances it as usual', () => {
    const learned = schedule(undefined, 'x', 'good', T0);
    expect(schedule(learned, 'x', 'good', learned.dueAt).intervalDays).toBe(6);
    expect(schedule(learned, 'x', 'good', learned.dueAt + 3 * DAY).intervalDays).toBe(6); // overdue is fine
  });

  it('is deterministic and does not mutate its input', () => {
    const p = newProgress('x', T0);
    const frozen = JSON.stringify(p);
    expect(schedule(p, 'x', 'good', T0)).toEqual(schedule(p, 'x', 'good', T0));
    expect(JSON.stringify(p)).toBe(frozen);
  });

  it('a sign is due exactly when its due time has passed', () => {
    const p = schedule(undefined, 'x', 'good', T0);
    expect(isDue(p, T0 + DAY - 1)).toBe(false);
    expect(isDue(p, T0 + DAY)).toBe(true);
  });

  it('maps quiz outcomes to grades', () => {
    expect(gradeFromAnswer({ correct: true })).toBe('good');
    expect(gradeFromAnswer({ correct: true, typo: true })).toBe('hard');
    expect(gradeFromAnswer({ correct: false })).toBe('again');
  });

  it('reports mastery levels', () => {
    expect(masteryLevel(undefined)).toBe(0);
    expect(masteryLevel(run(['again'])[0])).toBe(1);
    expect(masteryLevel(run(['good'])[0])).toBe(1);
    expect(masteryLevel(run(['good', 'good'])[1])).toBe(2);
    expect(masteryLevel(run(['good', 'good', 'good', 'good'])[3])).toBe(3);
  });

  it('startOfLocalDay lands at local midnight', () => {
    const d = new Date(startOfLocalDay(T0));
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
  });
});
