import { describe, expect, it } from 'vitest';
import {
  accuracy, activeDays, categoryCompletion, dayKey, lastDays, masteryCounts, shouldRemindExport, streak, todayCount, troubleSpots,
} from '../src/progress/stats.ts';
import type { LexEntry } from '../src/lexicon/types.ts';
import type { SignProgress } from '../src/storage/types.ts';

const at = (m: number, d: number, h = 12) => new Date(2026, m - 1, d, h).getTime();
const days = (...ds: [number, number][]) => activeDays(ds.map(([m, d]) => ({ at: at(m, d) })));
const NOW = at(6, 10, 15); // 10 June, mid-afternoon

describe('dayKey', () => {
  it('uses the local calendar day', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
    expect(dayKey(new Date(2026, 0, 6, 0, 1).getTime())).toBe('2026-01-06');
  });
});

describe('streak', () => {
  it('counts consecutive days including today', () => {
    expect(streak(days([6, 8], [6, 9], [6, 10]), NOW)).toBe(3);
  });
  it('does not punish a day that has not finished: no session yet today keeps yesterday\'s streak', () => {
    expect(streak(days([6, 8], [6, 9]), NOW)).toBe(2);
  });
  it('survives one missed day', () => {
    expect(streak(days([6, 6], [6, 7], [6, 9], [6, 10]), NOW)).toBe(4);
    expect(streak(days([6, 7], [6, 8], [6, 10]), NOW)).toBe(3);
  });
  it('ends after two missed days in a row, and starts fresh', () => {
    expect(streak(days([6, 5], [6, 6], [6, 10]), NOW)).toBe(1);
    expect(streak(days([6, 5], [6, 6]), NOW)).toBe(0);
    expect(streak(new Set(), NOW)).toBe(0);
  });
  it('a missed yesterday with nothing yet today still keeps the earlier run (one missed day allowed)', () => {
    expect(streak(days([6, 7], [6, 8]), NOW)).toBe(2);
  });
  it('works across month and year boundaries', () => {
    const jan2 = new Date(2027, 0, 2, 10).getTime();
    expect(streak(activeDays([{ at: new Date(2026, 11, 30, 9).getTime() }, { at: new Date(2026, 11, 31, 9).getTime() }, { at: new Date(2027, 0, 1, 9).getTime() }, { at: jan2 }]), jan2)).toBe(4);
  });
});

describe('weekly activity', () => {
  it('gives seven days, oldest first, with today last', () => {
    const bars = lastDays([{ at: at(6, 10) }, { at: at(6, 10, 9) }, { at: at(6, 8) }, { at: at(5, 1) }], NOW);
    expect(bars).toHaveLength(7);
    expect(bars.map((b) => b.key)[0]).toBe('2026-06-04');
    expect(bars[6]).toMatchObject({ key: '2026-06-10', count: 2, today: true });
    expect(bars[4]).toMatchObject({ key: '2026-06-08', count: 1, today: false });
    expect(bars.reduce((a, b) => a + b.count, 0)).toBe(3);
  });
  it('counts answers today', () => {
    expect(todayCount([{ at: at(6, 10, 1) }, { at: at(6, 10, 23) }, { at: at(6, 9) }], NOW)).toBe(2);
  });
  it('measures recent accuracy', () => {
    const r = [
      { at: NOW - 1000, grade: 'good' }, { at: NOW - 2000, grade: 'again' }, { at: NOW - 3000, grade: 'hard' },
      { at: NOW - 90 * 86_400_000, grade: 'again' },
    ];
    expect(accuracy(r, NOW)).toEqual({ total: 3, right: 2 });
  });
});

const entry = (id: string): LexEntry => ({ id, english: [id], chinese: null, category: 'x', dialect: 'both', video: '', sourceUrl: '', licenseNote: '' });
const unit = (id: string) => ({ entry: entry(id), key: id });
const prog = (id: string, o: Partial<SignProgress>): SignProgress => ({ id, schemaVersion: 2, ease: 2.5, intervalDays: 1, dueAt: 0, reps: 1, lapses: 0, ...o });

describe('mastery and completion', () => {
  const units = ['a', 'b', 'c', 'd', 'e'].map(unit);
  const p = new Map<string, SignProgress>([
    ['a', prog('a', { reps: 0, intervalDays: 0 })], // learning (missed)
    ['b', prog('b', { intervalDays: 1 })], // learning
    ['c', prog('c', { intervalDays: 6, reps: 2 })], // young
    ['d', prog('d', { intervalDays: 30, reps: 5 })], // mature
  ]);
  it('buckets signs by how well they are known', () => {
    expect(masteryCounts(units, p)).toEqual({ new: 1, learning: 2, young: 1, mature: 1 });
  });
  it('reports each category: total, met, known', () => {
    const cats = [{ id: 'x', en: 'X', zh: '甲' }, { id: 'y', en: 'Y', zh: '乙' }];
    const res = categoryCompletion(cats, new Map([['x', units], ['y', []]]), p);
    expect(res[0]).toMatchObject({ id: 'x', total: 5, seen: 4, known: 2 });
    expect(res[1]).toMatchObject({ id: 'y', total: 0, seen: 0, known: 0 });
  });
  it('lists the most-forgotten signs first', () => {
    const t = troubleSpots(new Map([['a', prog('a', { lapses: 1 })], ['b', prog('b', { lapses: 4 })], ['c', prog('c', { lapses: 0 })], ['d', prog('d', { lapses: 4, ease: 1.5 })]]));
    expect(t.map((x) => x.id)).toEqual(['d', 'b', 'a']);
  });
});

describe('backup reminder', () => {
  const D = 86_400_000;
  const now = 10 * 365 * D;
  it('stays quiet until there is something worth saving', () => {
    expect(shouldRemindExport({ reviewCount: 10, now })).toBe(false);
    expect(shouldRemindExport({ reviewCount: 49, now })).toBe(false);
  });
  it('asks once a real history has no backup', () => {
    expect(shouldRemindExport({ reviewCount: 50, now })).toBe(true);
  });
  it('is satisfied by a recent backup, then returns after a month', () => {
    expect(shouldRemindExport({ reviewCount: 500, lastExportAt: now - 5 * D, now })).toBe(false);
    expect(shouldRemindExport({ reviewCount: 500, lastExportAt: now - 31 * D, now })).toBe(true);
  });
  it('respects "later" for two weeks, so it never nags', () => {
    expect(shouldRemindExport({ reviewCount: 500, remindedAt: now - 3 * D, now })).toBe(false);
    expect(shouldRemindExport({ reviewCount: 500, remindedAt: now - 15 * D, now })).toBe(true);
  });
});
