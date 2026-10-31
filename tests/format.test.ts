import { describe, expect, it } from 'vitest';
import { formatWhen } from '../src/ui/format.ts';

const now = 1_000_000_000_000;
const H = 3_600_000;
describe('formatWhen', () => {
  it('reads naturally', () => {
    expect(formatWhen(now - 5, now)).toBe('now');
    expect(formatWhen(now + 10 * 60_000, now)).toBe('in 10 minutes');
    expect(formatWhen(now + 3 * H, now)).toBe('in 3 hours');
    expect(formatWhen(now + 24 * H - 40, now)).toBe('tomorrow');
    expect(formatWhen(now + 26 * H, now)).toBe('tomorrow');
    expect(formatWhen(now + 6 * 24 * H, now)).toBe('in 6 days');
  });
});
