import type { SignProgress, SignProgressV1 } from './types.ts';

export function migrateProgressV1(old: SignProgressV1): SignProgress {
  const due = Date.parse(`${old.due}T00:00:00Z`);
  return {
    id: old.sign,
    schemaVersion: 2,
    ease: Number.isFinite(old.ef) ? old.ef : 2.5,
    intervalDays: Number.isFinite(old.interval) ? old.interval : 0,
    dueAt: Number.isFinite(due) ? due : Date.now(),
    reps: old.n ?? 0,
    lapses: 0,
  };
}

/** Upgrades a progress record of any known version to the current one; unknown shapes return null. */
export function upgradeProgress(raw: unknown): SignProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.schemaVersion === 2 && typeof r.id === 'string') return r as unknown as SignProgress;
  if (typeof r.sign === 'string' && 'ef' in r) return migrateProgressV1(r as unknown as SignProgressV1);
  return null;
}
