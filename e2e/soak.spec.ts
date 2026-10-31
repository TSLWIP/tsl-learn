import { expect, test, type Page } from '@playwright/test';
import { play, ready } from './helpers.ts';

/**
 * Soak test: weeks of study on the BUILT copy, served under a subpath like a GitHub Pages project site.
 * Each "day" the clock is moved forward, the app is launched fresh, and the learner does what is due and a few
 * new signs, making mistakes like a real person. Faults are injected on fixed days. After every day the
 * stored data and the page itself are checked for damage and leaks.
 *
 *   npm run soak                       (fixtures, 14 days, CI-sized)
 *   REAL=1 SOAK_DAYS=30 npm run soak   (the real 5,390-sign dictionary and clips, local only)
 */
const REAL = process.env.REAL === '1';
const DAYS = Number(process.env.SOAK_DAYS ?? (REAL ? 30 : 14));
const DAY = 86_400_000;
const SKIP_DAY = 7; // the learner takes a day off
const CACHE_WIPE_DAY = 3;
const NOT_FOUND_DAY = 5;
const OFFLINE_DAY = 10;
const SW_UPDATE_DAY = 8;
const BACKUP_DAY = Math.min(12, DAYS - 2);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rows = (page: Page, store: string) =>
  page.evaluate(
    (store) =>
      new Promise<any[]>((resolve, reject) => {
        const r = indexedDB.open('tsl-learn');
        r.onsuccess = () => {
          const q = r.result.transaction(store).objectStore(store).getAll();
          q.onsuccess = () => (r.result.close(), resolve(q.result));
          q.onerror = () => reject(q.error);
        };
        r.onerror = () => reject(r.error);
      }),
    store,
  );

async function newCount(page: Page): Promise<number> {
  return Number(((await page.getByTestId('new-count').textContent()) ?? '').match(/\d+/)?.[0] ?? 0);
}
async function dueCount(page: Page): Promise<number> {
  return Number(((await page.getByTestId('due-count').textContent()) ?? '').match(/\d+/)?.[0] ?? 0);
}

test(`soak: ${DAYS} days of study on the built copy under /tsl-learn/`, async ({ page, context, request }) => {
  test.setTimeout(45 * 60_000);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) problems.push(`console.error: ${m.text()}`);
  });

  // Fake "today" (a stored offset, so it survives reloads) and count object URLs made vs released.
  await context.addInitScript(() => {
    const off = Number(localStorage.getItem('__soakOffset') || 0);
    if (off) {
      const R = Date;
      class F extends R {
        constructor(...a: any[]) {
          if (a.length === 0) super(R.now() + off);
          else super(...(a as [any]));
        }
        static now() {
          return R.now() + off;
        }
      }
      (window as any).Date = F;
    }
    const made = { n: 0, r: 0 };
    (window as any).__blobs = made;
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (b: Blob | MediaSource) => (made.n++, create(b));
    URL.revokeObjectURL = (u: string) => (made.r++, revoke(u));
  });

  const rand = mulberry32(2026);
  await request.get('/__reset');
  await page.goto('/tsl-learn/');
  await ready(page);

  // The built copy must behave as a subpath deploy: everything relative, worker scoped to the subpath.
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope);
  expect(scope).toMatch(/\/tsl-learn\/$/);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  const lexicon = await page.evaluate(() => fetch('data/lexicon.json').then((r) => r.json()));
  const validIds = new Set<string>(lexicon.entries.map((e: any) => e.id));

  let practicedDays = 0;
  let lastReviewCount = 0;
  const heap: number[] = [];

  for (let day = 0; day < DAYS; day++) {
    if (day === SKIP_DAY) continue; // nothing at all happens on a day off

    await page.evaluate((o) => localStorage.setItem('__soakOffset', String(o)), day * DAY);
    await page.reload();
    await ready(page);
    const heapStart: number = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? 0);

    // ---- injected faults -------------------------------------------------------------------------------------
    if (day === CACHE_WIPE_DAY) {
      await page.evaluate(async () => {
        for (const k of await caches.keys()) await caches.delete(k);
      });
    }
    if (day === NOT_FOUND_DAY) await request.get(`/__ctl?notFound=${REAL ? 'A/able_n.mp4' : 'T/thank_n.mp4'}`);
    if (day === NOT_FOUND_DAY + 1) await request.get(`/__ctl?allow=${REAL ? 'A/able_n.mp4' : 'T/thank_n.mp4'}`);
    if (day === SW_UPDATE_DAY) {
      await request.get('/__ctl?swSuffix=-soak');
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
      await expect(page.getByTestId('update-banner')).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Reload' }).click();
      await ready(page);
      const names = await page.evaluate(() => caches.keys());
      expect(names.filter((n: string) => n.startsWith('tsl-shell-')), 'old shell caches removed after update').toHaveLength(1);
    }
    if (day === BACKUP_DAY) {
      const before = (await rows(page, 'reviews')).length;
      await page.getByTestId('tab-settings').click();
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
      const file = (await dl.path())!;
      await page.evaluate(() => new Promise<void>((res) => { const r = indexedDB.deleteDatabase('tsl-learn'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
      await page.reload();
      await ready(page);
      expect((await rows(page, 'reviews')).length).toBe(0); // really gone
      await page.getByTestId('tab-settings').click();
      await page.getByTestId('import').setInputFiles(file);
      await expect(page.getByTestId('settings-msg')).toContainText('Imported');
      await page.reload();
      await ready(page);
      expect((await rows(page, 'reviews')).length, 'backup restored every review').toBe(before);
    }
    const offline = day === OFFLINE_DAY;
    if (offline) await context.setOffline(true);

    // ---- the day's study -------------------------------------------------------------------------------------
    await page.getByTestId('tab-learn').click();
    await expect(page.getByTestId('due-count')).toBeVisible();
    await page.getByTestId('mode-mixed').click();
    await page.getByTestId('length-20').click();

    let sessions = 0;
    if ((await dueCount(page)) > 0) {
      await page.getByTestId('start-review').click();
      await play(page, { wrongRate: 0.15, rand });
      await page.getByTestId('summary-done').click();
      sessions++;
    }
    if (!offline && (await newCount(page)) > 0) {
      await page.getByTestId('start-learn').click();
      await play(page, { wrongRate: 0.15, rand });
      await page.getByTestId('summary-done').click();
      sessions++;
    }
    if (sessions === 0 || day % 3 === 0) {
      await page.getByTestId(`mode-${day % 2 ? 'typed' : 'matching'}`).click();
      await page.getByTestId('start-quick').click();
      await play(page, { wrongRate: 0.15, rand });
      await page.getByTestId('summary-done').click();
    }
    practicedDays++;
    if (offline) await context.setOffline(false);

    // ---- checks after every day ------------------------------------------------------------------------------
    const reviews = await rows(page, 'reviews');
    expect(reviews.length, `day ${day}: practice was recorded`).toBeGreaterThan(lastReviewCount);
    lastReviewCount = reviews.length;

    for (const p of await rows(page, 'progress')) {
      expect(validIds.has(p.id), `day ${day}: progress for unknown sign ${p.id}`).toBe(true);
      expect(p.schemaVersion).toBe(2);
      expect(Number.isFinite(p.dueAt) && p.intervalDays >= 0 && p.reps >= 0 && p.lapses >= 0, `day ${day}: sane schedule for ${p.id}`).toBe(true);
      expect(p.ease).toBeGreaterThanOrEqual(1.3);
      expect(p.ease).toBeLessThan(5);
      expect(p.intervalDays, `${p.id} interval is bounded`).toBeLessThan(400);
    }
    expect(await rows(page, 'errors'), `day ${day}: the in-app error log stays empty`).toEqual([]);

    // Every object URL made for a clip must have been released once the player is gone (the old app leaked these).
    const blobs = await page.evaluate(() => (window as any).__blobs as { n: number; r: number });
    expect(blobs.n - blobs.r, `day ${day}: object URLs made ${blobs.n}, released ${blobs.r}`).toBeLessThanOrEqual(2);

    const heapEnd: number = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? 0);
    heap.push(heapEnd);
    if (heapStart) expect(heapEnd - heapStart, `day ${day}: heap growth in one day of use`).toBeLessThan(80e6);
  }

  // ---- after the whole run ------------------------------------------------------------------------------------
  await page.evaluate((o) => localStorage.setItem('__soakOffset', String(o)), (DAYS - 1) * DAY);
  await page.reload();
  await ready(page);
  await page.getByTestId('tab-progress').click();
  await expect(page.getByTestId('mastery-card')).toBeVisible();
  const total = Number(((await page.getByTestId('total-answers').textContent()) ?? '').replace(/,/g, ''));
  expect(total, 'Progress total matches the stored review log').toBe((await rows(page, 'reviews')).length);
  // One day off in the middle did not break the run.
  await expect(page.getByTestId('streak')).toContainText(String(practicedDays));
  if (REAL) {
    const young = Number(((await page.getByTestId('mastery-young').textContent()) ?? '0').match(/\d+/)?.[0]);
    const mature = Number(((await page.getByTestId('mastery-mature').textContent()) ?? '0').match(/\d+/)?.[0]);
    expect(young + mature, 'after weeks, some signs have graduated to long intervals').toBeGreaterThan(0);
  }
  const usage = await page.evaluate(async () => (await navigator.storage.estimate()).usage ?? 0);
  console.log(
    `soak ok: ${DAYS} days, ${practicedDays} practised, ${lastReviewCount} answers, ` +
      `storage ${(usage / 1e6).toFixed(1)} MB, heap ${(Math.min(...heap) / 1e6).toFixed(0)}-${(Math.max(...heap) / 1e6).toFixed(0)} MB`,
  );
  expect(problems, problems.join('\n')).toEqual([]);
});
