import { expect, test, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

test.beforeEach(async ({ request }) => {
  await request.get('/__reset');
});

const home = (page: Page) => page.getByTestId('home-count');

async function firstLoad(page: Page) {
  await page.goto('/');
  await ready(page);
  // wait until the service worker controls the page (shell cached)
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

async function openSettings(page: Page) {
  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('storage-status')).toBeVisible();
}

async function downloadEtiquette(page: Page, expected = 'Downloaded 3 clip(s).') {
  await openSettings(page);
  await page.getByTestId('dl-etiquette').click();
  await expect(page.getByTestId('settings-msg')).toHaveText(expected);
}

const cachedCount = (page: Page) => page.getByTestId('cached-count');

test('fresh start shows the sign list, never a blank page', async ({ page }) => {
  await firstLoad(page);
  await expect(home(page)).toContainText('7 signs ready');
  await page.getByTestId('tab-lookup').click();
  await expect(page.getByTestId('grammar-note')).toContainText('word order differ');
});

test('downloads a category politely (never more than 2 at once) and shows storage status', async ({ page, request }) => {
  await firstLoad(page);
  await downloadEtiquette(page);
  await expect(cachedCount(page)).toContainText('3 (');
  const stats = await (await request.get('/__stats')).json();
  expect(stats.peak).toBeLessThanOrEqual(2);
  await expect(page.getByTestId('persisted')).toBeVisible();
});

test('chaos: Cache API cleared while online -> app still starts and offline copy is restored', async ({ page }) => {
  await firstLoad(page);
  await downloadEtiquette(page);
  await page.evaluate(async () => {
    for (const k of await caches.keys()) await caches.delete(k);
  });
  await page.reload();
  await ready(page);
  await openSettings(page);
  await expect(cachedCount(page)).toContainText('3 (');
});

test('chaos: IndexedDB cleared -> app boots with empty progress, no crash', async ({ page }) => {
  await firstLoad(page);
  await downloadEtiquette(page);
  const outcome = await page.evaluate(
    () =>
      new Promise<string>((res) => {
        const r = indexedDB.deleteDatabase('tsl-learn');
        r.onsuccess = () => res('deleted');
        r.onblocked = () => res('blocked');
        r.onerror = () => res('error');
      }),
  );
  expect(outcome).not.toBe('error');
  await page.reload();
  await ready(page);
  await openSettings(page);
  await expect(cachedCount(page)).toContainText('0 (');
});

test('chaos: offline cold start works from the installed copy', async ({ page, context }) => {
  await firstLoad(page);
  await downloadEtiquette(page);
  await context.setOffline(true);
  await page.reload();
  await ready(page);
  await openSettings(page);
  await expect(cachedCount(page)).toContainText('3 (');
});

test('chaos: offline AND app cache wiped -> clear message instead of a browser error page, then recovers', async ({ page, context }) => {
  await firstLoad(page);
  await page.evaluate(async () => {
    for (const k of await caches.keys()) await caches.delete(k);
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#sw-offline')).toContainText('saved copy of the app was cleared');
  await context.setOffline(false);
  await page.reload();
  await ready(page);
});

test('chaos: schema upgrade from a v1 store migrates saved progress', async ({ page }) => {
  await firstLoad(page);
  // Replace the database with one exactly as release 1 would have written it.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const del = indexedDB.deleteDatabase('tsl-learn');
        del.onerror = () => reject(del.error);
        del.onsuccess = () => {
          const r = indexedDB.open('tsl-learn', 1);
          r.onupgradeneeded = () => {
            const s = r.result.createObjectStore('progress', { keyPath: 'sign' });
            s.put({ sign: 'thank_a', ef: 2.2, interval: 6, due: '2026-03-01', n: 4 });
            s.put({ sign: 'one', ef: 2.5, interval: 1, due: '2026-03-02', n: 1 });
          };
          r.onsuccess = () => (r.result.close(), resolve());
          r.onerror = () => reject(r.error);
        };
        del.onblocked = () => undefined;
      }),
  );
  await page.reload();
  await ready(page);
  const rows = await page.evaluate(
    () =>
      new Promise<any[]>((resolve, reject) => {
        const r = indexedDB.open('tsl-learn');
        r.onsuccess = () => {
          const q = r.result.transaction('progress').objectStore('progress').getAll();
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => reject(q.error);
        };
      }),
  );
  expect(rows.map((x) => x.id).sort()).toEqual(['one', 'thank_a']);
  expect(rows.find((x) => x.id === 'thank_a')).toMatchObject({ schemaVersion: 2, reps: 4, intervalDays: 6 });
});

test('chaos: a clip returning 404 degrades gracefully and reports it', async ({ page, request }) => {
  await request.get('/__ctl?notFound=G/good_bye.mp4');
  await firstLoad(page);
  await downloadEtiquette(page, 'Downloaded 2 clip(s), 1 failed.');
  await expect(cachedCount(page)).toContainText('2 (');
  // next launch tries to repair it, fails, and still starts normally
  await page.reload();
  await ready(page);
  await expect(page.getByTestId('boot-note')).toContainText('could not be repaired');
  // the server fixes itself -> manual repair picks it up
  await request.get('/__ctl?allow=G/good_bye.mp4');
  await openSettings(page);
  await page.getByTestId('repair').click();
  await expect(page.getByTestId('settings-msg')).toContainText('1 fixed');
  await expect(cachedCount(page)).toContainText('3 (');
});

test('chaos: corrupt cached clip is detected and only that clip is re-downloaded at startup', async ({ page, request }) => {
  await firstLoad(page);
  await downloadEtiquette(page);
  await request.get('/__reset'); // clear hit counters
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('tsl-learn');
        r.onsuccess = () => {
          const tx = r.result.transaction('clips', 'readwrite');
          tx.objectStore('clips').put({ video: 'T/thank_b.mp4', blob: new Blob([new Uint8Array(5)]), size: 5, cachedAt: 1 });
          tx.oncomplete = () => (r.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await ready(page);
  const stats = await (await request.get('/__stats')).json();
  expect(Object.keys(stats.clipHits)).toEqual(['T/thank_b.mp4']);
  await openSettings(page);
  await expect(cachedCount(page)).toContainText('3 (');
});

test('chaos: 5,000 review events survive reload, export and import', async ({ page }) => {
  await firstLoad(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('tsl-learn');
        r.onsuccess = () => {
          const tx = r.result.transaction('reviews', 'readwrite');
          const s = tx.objectStore('reviews');
          const t0 = Date.now() - 5000 * 60_000;
          for (let i = 0; i < 5000; i++) s.add({ schemaVersion: 2, signId: `s${i % 300}`, at: t0 + i * 60_000, grade: 'good', mode: 'flashcard' });
          tx.oncomplete = () => (r.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await ready(page);
  await openSettings(page);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
  const path = await download.path();
  const fs = await import('node:fs');
  const backup = JSON.parse(fs.readFileSync(path, 'utf8'));
  expect(backup).toMatchObject({ app: 'tsl-learn', schemaVersion: 2 });
  expect(backup.reviews).toHaveLength(5000);

  // wipe, then restore from the file
  await page.evaluate(
    () =>
      new Promise<void>((res) => {
        const r = indexedDB.deleteDatabase('tsl-learn');
        r.onsuccess = r.onerror = r.onblocked = () => res();
      }),
  );
  await page.reload();
  await ready(page);
  await openSettings(page);
  await page.getByTestId('import').setInputFiles(path);
  await expect(page.getByTestId('settings-msg')).toContainText('5000 reviews');
});

test('update flow: new version shows a prompt, old caches are removed after reload', async ({ page, request }) => {
  await firstLoad(page);
  const before = await page.evaluate(() => caches.keys());
  expect(before.filter((k) => k.startsWith('tsl-shell-'))).toHaveLength(1);

  await request.get('/__ctl?swSuffix=-v2');
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
  await expect(page.getByTestId('update-banner')).toBeVisible();

  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(home(page)).toBeVisible();
  await expect
    .poll(async () => (await page.evaluate(() => caches.keys())).filter((k: string) => k.startsWith('tsl-shell-')))
    .toHaveLength(1);
  const after = (await page.evaluate(() => caches.keys())).filter((k: string) => k.startsWith('tsl-shell-'));
  expect(after[0]).not.toBe(before.find((k: string) => k.startsWith('tsl-shell-')));
});

test('fatal: sign list unreachable with no saved copy shows a clear message and a retry', async ({ page, context }) => {
  // Block data before the app ever loads it successfully.
  await context.route('**/data/*.json', (r) => r.abort());
  await page.goto('/');
  await expect(page.getByTestId('fatal')).toBeVisible();
  await expect(page.getByTestId('fatal-message')).toContainText('could not be loaded');
  await context.unroute('**/data/*.json');
  await page.getByRole('button', { name: 'Try again' }).click();
  await ready(page);
});
