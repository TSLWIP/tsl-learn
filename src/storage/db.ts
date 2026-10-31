import { migrateProgressV1 } from './migrations.ts';
import { DB_NAME, SCHEMA_VERSION, type SignProgressV1 } from './types.ts';

export class NewerSchemaError extends Error {
  constructor() {
    super('Stored data was written by a newer version of the app');
    this.name = 'NewerSchemaError';
  }
}

export function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error ?? new Error('transaction aborted'));
  });
}

function upgrade(db: IDBDatabase, tx: IDBTransaction, oldVersion: number): void {
  if (oldVersion < 1) {
    db.createObjectStore('progress', { keyPath: 'id' });
  }
  if (oldVersion < 2) {
    if (oldVersion === 1) {
      // v1 keyed progress by `sign`; read every row, then rebuild the store with the new keyPath.
      const rows: SignProgressV1[] = [];
      tx.objectStore('progress').openCursor().onsuccess = (ev) => {
        const cur = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cur) {
          rows.push(cur.value as SignProgressV1);
          cur.continue();
          return;
        }
        db.deleteObjectStore('progress');
        const fresh = db.createObjectStore('progress', { keyPath: 'id' });
        for (const r of rows) fresh.put(migrateProgressV1(r));
      };
    }
    const reviews = db.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true });
    reviews.createIndex('at', 'at');
    reviews.createIndex('signId', 'signId');
    db.createObjectStore('decks', { keyPath: 'id' });
    db.createObjectStore('clips', { keyPath: 'video' });
    db.createObjectStore('errors', { keyPath: 'id', autoIncrement: true });
    db.createObjectStore('meta', { keyPath: 'key' });
  }
}

export function openDatabase(name = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, SCHEMA_VERSION);
    r.onupgradeneeded = (ev) => upgrade(r.result, r.transaction!, ev.oldVersion);
    r.onsuccess = () => {
      const db = r.result;
      // Another tab is upgrading: close so it is not blocked.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    r.onerror = () => reject(r.error?.name === 'VersionError' ? new NewerSchemaError() : r.error);
    r.onblocked = () => reject(new Error('Database upgrade blocked by another open tab'));
  });
}
