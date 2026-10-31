export type FetchOutcome =
  | { ok: true; blob: Blob }
  | { ok: false; reason: 'not-found' | 'http' | 'network' | 'size-mismatch' | 'tripped'; status?: number };

export interface FetcherOptions {
  maxConcurrent: number;
  minGapMs: number;
  maxRetries?: number;
  /** after this many failures in a row the fetcher stops hitting the server until reset() */
  tripAfter?: number;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Polite download queue for a small third-party server: capped concurrency,
 * a minimum gap between request starts, backoff on 429/5xx (honouring
 * Retry-After), no retry on 404, and a circuit breaker.
 */
export class PoliteFetcher {
  private active = 0;
  private nextStart = 0;
  private waiters: (() => void)[] = [];
  private failuresInARow = 0;
  private readonly o: Required<FetcherOptions>;

  constructor(opts: FetcherOptions) {
    this.o = {
      maxRetries: 3,
      tripAfter: 8,
      fetchFn: (...a) => fetch(...a),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: () => Date.now(),
      ...opts,
    };
  }

  get tripped(): boolean {
    return this.failuresInARow >= this.o.tripAfter;
  }
  reset(): void {
    this.failuresInARow = 0;
  }

  private async acquire(high: boolean): Promise<void> {
    // A clip the learner just tapped jumps ahead of a bulk pack download.
    while (this.active >= this.o.maxConcurrent) {
      await new Promise<void>((r) => (high ? this.waiters.unshift(r) : this.waiters.push(r)));
    }
    this.active++;
    const start = Math.max(this.o.now(), this.nextStart);
    this.nextStart = start + this.o.minGapMs;
    const wait = start - this.o.now();
    if (wait > 0) await this.o.sleep(wait);
  }
  private release(): void {
    this.active--;
    this.waiters.shift()?.();
  }

  async fetchBlob(url: string, expectedSize?: number, priority: 'high' | 'low' = 'low'): Promise<FetchOutcome> {
    if (this.tripped) return { ok: false, reason: 'tripped' };
    await this.acquire(priority === 'high');
    try {
      let last: FetchOutcome = { ok: false, reason: 'network' };
      for (let attempt = 0; attempt <= this.o.maxRetries; attempt++) {
        if (attempt > 0) await this.o.sleep(this.backoff(attempt, last));
        last = await this.once(url, expectedSize);
        if (last.ok) {
          this.failuresInARow = 0;
          return last;
        }
        // 404 and a wrong-size body will not fix themselves by asking again.
        if (last.reason === 'not-found') return last;
        if (last.reason === 'size-mismatch') break;
      }
      this.failuresInARow++;
      return last;
    } finally {
      this.release();
    }
  }

  private retryAfterMs = 0;
  private backoff(attempt: number, _last: FetchOutcome): number {
    const base = 500 * 2 ** (attempt - 1);
    const hinted = this.retryAfterMs;
    this.retryAfterMs = 0;
    return Math.max(base, hinted);
  }

  private async once(url: string, expectedSize?: number): Promise<FetchOutcome> {
    try {
      const r = await this.o.fetchFn(url);
      if (r.status === 404) return { ok: false, reason: 'not-found', status: 404 };
      if (!r.ok) {
        const ra = Number(r.headers.get('retry-after'));
        if (Number.isFinite(ra) && ra > 0) this.retryAfterMs = Math.min(ra, 60) * 1000;
        return { ok: false, reason: 'http', status: r.status };
      }
      const blob = await r.blob();
      if (expectedSize !== undefined && blob.size !== expectedSize) return { ok: false, reason: 'size-mismatch' };
      return { ok: true, blob };
    } catch {
      return { ok: false, reason: 'network' };
    }
  }
}
