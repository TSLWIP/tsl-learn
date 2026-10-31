import { describe, expect, it } from 'vitest';
import { PoliteFetcher } from '../src/clips/fetcher.ts';

const bytes = (n: number) => new Blob([new Uint8Array(n)]);
const res = (status: number, body: Blob | null = null, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers });

function make(fetchFn: typeof fetch, extra: Partial<ConstructorParameters<typeof PoliteFetcher>[0]> = {}) {
  const sleeps: number[] = [];
  let clock = 0;
  const f = new PoliteFetcher({
    maxConcurrent: 2,
    minGapMs: 250,
    fetchFn,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
    ...extra,
  });
  return { f, sleeps };
}

describe('PoliteFetcher', () => {
  it('returns the blob on success and checks the expected size', async () => {
    const { f } = make(async () => res(200, bytes(10)));
    expect(await f.fetchBlob('u', 10)).toMatchObject({ ok: true });
    expect(await f.fetchBlob('u', 11)).toMatchObject({ ok: false, reason: 'size-mismatch' });
  });

  it('does not retry a 404', async () => {
    let calls = 0;
    const { f } = make(async () => (calls++, res(404)));
    expect(await f.fetchBlob('u')).toMatchObject({ ok: false, reason: 'not-found' });
    expect(calls).toBe(1);
  });

  it('retries 503 with exponential backoff and then succeeds', async () => {
    const seq = [503, 503, 200];
    const { f, sleeps } = make(async () => {
      const s = seq.shift()!;
      return s === 200 ? res(200, bytes(1)) : res(s);
    });
    expect(await f.fetchBlob('u')).toMatchObject({ ok: true });
    expect(sleeps.filter((s) => s >= 500)).toEqual([500, 1000]);
  });

  it('honours Retry-After on 429', async () => {
    const seq = [429, 200];
    const { f, sleeps } = make(async () => {
      const s = seq.shift()!;
      return s === 200 ? res(200, bytes(1)) : res(429, null, { 'retry-after': '7' });
    });
    await f.fetchBlob('u');
    expect(sleeps).toContain(7000);
  });

  it('trips the circuit breaker after repeated failures and stops calling the server', async () => {
    let calls = 0;
    const { f } = make(async () => (calls++, res(500)), { maxRetries: 0, tripAfter: 3 });
    for (let i = 0; i < 3; i++) await f.fetchBlob('u');
    const before = calls;
    expect(await f.fetchBlob('u')).toMatchObject({ ok: false, reason: 'tripped' });
    expect(calls).toBe(before);
    f.reset();
    await f.fetchBlob('u');
    expect(calls).toBe(before + 1);
  });

  it('never exceeds the concurrency cap', async () => {
    let active = 0;
    let peak = 0;
    const real = new PoliteFetcher({
      maxConcurrent: 2,
      minGapMs: 0,
      sleep: async () => undefined,
      fetchFn: async () => {
        peak = Math.max(peak, ++active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return res(200, bytes(1));
      },
    });
    await Promise.all(Array.from({ length: 10 }, () => real.fetchBlob('u')));
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('spaces request starts by the minimum gap', async () => {
    const { f, sleeps } = make(async () => res(200, bytes(1)), { maxConcurrent: 4 });
    await Promise.all([f.fetchBlob('a'), f.fetchBlob('b'), f.fetchBlob('c')]);
    // starts at 0, 250 and 500 ms: the shared fake clock advances while each waits, so the waits sum to 500
    expect(sleeps.reduce((a, b) => a + b, 0)).toBe(500);
  });
});
