const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "in 10 minutes", "tomorrow", "in 6 days": when something will next be due. */
export function formatWhen(dueAt: number, now: number): string {
  const d = dueAt - now;
  if (d <= 0) return 'now';
  if (d < HOUR) return `in ${Math.max(1, Math.round(d / MIN))} minutes`;
  // "a day from now" is measured a moment later than it was set, so anything near 24h reads as tomorrow
  if (d < 20 * HOUR) return `in ${Math.round(d / HOUR)} hours`;
  const days = Math.round(d / DAY);
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}
