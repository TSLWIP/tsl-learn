import { req, txDone } from './db.ts';
import type { CachedClip, Deck, ErrorRecord, ReviewEvent, SignProgress } from './types.ts';
import { SCHEMA_VERSION } from './types.ts';

const MAX_ERRORS = 200;

export class Repo {
  constructor(readonly db: IDBDatabase) {}

  async getProgress(id: string): Promise<SignProgress | undefined> {
    return req(this.db.transaction('progress').objectStore('progress').get(id));
  }
  async allProgress(): Promise<SignProgress[]> {
    return req(this.db.transaction('progress').objectStore('progress').getAll());
  }
  async putProgress(p: SignProgress): Promise<void> {
    const tx = this.db.transaction('progress', 'readwrite');
    tx.objectStore('progress').put(p);
    await txDone(tx);
  }

  /** Appends a review and the matching progress update atomically. */
  async recordReview(e: Omit<ReviewEvent, 'schemaVersion' | 'id'>, p: SignProgress): Promise<void> {
    const tx = this.db.transaction(['reviews', 'progress'], 'readwrite');
    tx.objectStore('reviews').add({ ...e, schemaVersion: SCHEMA_VERSION });
    tx.objectStore('progress').put(p);
    await txDone(tx);
  }
  async addReviews(events: Omit<ReviewEvent, 'schemaVersion' | 'id'>[]): Promise<void> {
    const tx = this.db.transaction('reviews', 'readwrite');
    const s = tx.objectStore('reviews');
    for (const e of events) s.add({ ...e, schemaVersion: SCHEMA_VERSION });
    await txDone(tx);
  }
  async allReviews(): Promise<ReviewEvent[]> {
    return req(this.db.transaction('reviews').objectStore('reviews').getAll());
  }
  async reviewsSince(at: number): Promise<ReviewEvent[]> {
    const idx = this.db.transaction('reviews').objectStore('reviews').index('at');
    return req(idx.getAll(IDBKeyRange.lowerBound(at)));
  }

  async allDecks(): Promise<Deck[]> {
    return req(this.db.transaction('decks').objectStore('decks').getAll());
  }
  async putDeck(d: Deck): Promise<void> {
    const tx = this.db.transaction('decks', 'readwrite');
    tx.objectStore('decks').put(d);
    await txDone(tx);
  }

  async deleteDeck(id: string): Promise<void> {
    const tx = this.db.transaction('decks', 'readwrite');
    tx.objectStore('decks').delete(id);
    await txDone(tx);
  }

  async getClip(video: string): Promise<CachedClip | undefined> {
    return req(this.db.transaction('clips').objectStore('clips').get(video));
  }
  async putClip(c: CachedClip): Promise<void> {
    const tx = this.db.transaction('clips', 'readwrite');
    tx.objectStore('clips').put(c);
    await txDone(tx);
  }
  async deleteClip(video: string): Promise<void> {
    const tx = this.db.transaction('clips', 'readwrite');
    tx.objectStore('clips').delete(video);
    await txDone(tx);
  }
  /** Lists cached clips as video -> stored size. */
  async clipSizes(): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const tx = this.db.transaction('clips');
    await new Promise<void>((res, rej) => {
      const c = tx.objectStore('clips').openCursor();
      c.onsuccess = () => {
        const cur = c.result;
        if (!cur) return res();
        out.set(cur.key as string, (cur.value as CachedClip).size);
        cur.continue();
      };
      c.onerror = () => rej(c.error);
    });
    return out;
  }

  async logError(where: string, err: unknown): Promise<void> {
    const e = err instanceof Error ? err : new Error(String(err));
    const rec: ErrorRecord = { at: Date.now(), where, message: e.message, stack: e.stack?.slice(0, 1500) };
    const tx = this.db.transaction('errors', 'readwrite');
    const s = tx.objectStore('errors');
    s.add(rec);
    const count = s.count();
    count.onsuccess = () => {
      let excess = count.result - MAX_ERRORS;
      if (excess <= 0) return;
      s.openCursor().onsuccess = (ev) => {
        const cur = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cur && excess-- > 0) {
          cur.delete();
          cur.continue();
        }
      };
    };
    await txDone(tx);
  }
  async allErrors(): Promise<ErrorRecord[]> {
    return req(this.db.transaction('errors').objectStore('errors').getAll());
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const r = await req(this.db.transaction('meta').objectStore('meta').get(key));
    return (r as { value: T } | undefined)?.value;
  }
  async setMeta(key: string, value: unknown): Promise<void> {
    const tx = this.db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key, value });
    await txDone(tx);
  }
}
