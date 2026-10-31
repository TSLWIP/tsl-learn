import { expect, test, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

test.beforeEach(async ({ request }) => {
  await request.get('/__reset');
});

const input = (p: Page) => p.getByTestId('lookup-input');

async function lookup(page: Page, text: string) {
  await input(page).fill(text);
  await page.getByTestId('lookup-go').click();
}

async function start(page: Page) {
  await page.goto('/');
  await ready(page);
  await page.getByTestId('tab-lookup').click();
}

/** the clip is really decoding and moving, not just present in the DOM */
async function expectPlaying(page: Page) {
  const v = page.getByTestId('player-video');
  await expect(v).toBeVisible();
  await expect
    .poll(() => v.evaluate((el: HTMLVideoElement) => el.readyState >= 2 && !el.paused && el.currentTime > 0), { timeout: 10_000 })
    .toBe(true);
}

test('"Thank you" shows one chip, the northern sign first, a playing clip and the grammar note', async ({ page }) => {
  await start(page);
  await expect(page.getByTestId('grammar-note')).toContainText('not a translation');
  await lookup(page, 'Thank you');
  await expect(page.getByTestId('chip-sign')).toHaveCount(1);
  await expect(page.getByTestId('chip-sign')).toContainText('4 signs');
  await expect(page.getByTestId('detail-zh')).toHaveText('感謝');
  await expect(page.getByTestId('detail-dialect')).toContainText('Northern');
  await expectPlaying(page);
});

test('dialect preference changes which sign is shown first', async ({ page }) => {
  await start(page);
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('dialect-south').click();
  await page.getByTestId('tab-lookup').click();
  await lookup(page, 'thank');
  await expect(page.getByTestId('detail-dialect')).toContainText('Southern');
});

test('all variants are listed and labelled; a pinned sign survives a reload', async ({ page }) => {
  await start(page);
  await lookup(page, 'thank');
  for (const id of ['thank_a', 'thank_b', 'thank_n', 'thank_s']) await expect(page.getByTestId(`variant-${id}`)).toBeVisible();
  await page.getByTestId('variant-thank_b').click();
  await expect(page.getByTestId('detail-dialect')).toContainText('Both');
  await page.getByTestId('pin').click();
  await expect(page.getByTestId('pin')).toContainText('Preferred sign');
  // the preference is written to IndexedDB in the background: wait until it has landed before reloading
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const r = indexedDB.open('tsl-learn');
            r.onsuccess = () => {
              const g = r.result.transaction('meta').objectStore('meta').get('prefs');
              g.onsuccess = () => (r.result.close(), resolve(JSON.stringify(g.result ?? null).includes('thank_b')));
              g.onerror = () => (r.result.close(), resolve(false));
            };
            r.onerror = () => resolve(false);
          }),
      ),
    )
    .toBe(true);
  await page.reload();
  await ready(page);
  await page.getByTestId('tab-lookup').click();
  await lookup(page, 'thank');
  await expect(page.getByTestId('detail-dialect')).toContainText('Both');
  await expect(page.getByTestId('variant-thank_b')).toHaveAttribute('aria-pressed', 'true');
});

test('"Hello" says plainly there is no sign, offers related signs, and can be flagged', async ({ page }) => {
  await start(page);
  await lookup(page, 'Hello');
  await expect(page.getByTestId('chip-sign')).toHaveCount(0);
  await expect(page.getByTestId('player-video')).toHaveCount(0);
  await expect(page.getByTestId('missing-panel')).toContainText('No sign found for “hello”');
  await page.getByTestId('suggestion').first().click();
  await expect(page.getByTestId('detail-en')).toHaveText('welcome');
  await page.getByTestId('flag-missing').click();
  await expect(page.getByTestId('flag-missing')).toContainText('Flagged');
  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('flag-list')).toContainText('hello');
});

test('words with no sign or no separate sign are shown in typed order', async ({ page }) => {
  await start(page);
  await lookup(page, 'thank are good bye');
  await expect(page.getByTestId('chips').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('chip-skipped')).toContainText('are');
  await page.getByTestId('chip-skipped').click();
  await expect(page.getByTestId('skipped-panel')).toContainText('no separate sign');
});

test('a phrase plays through in typed order by itself, and can be replayed', async ({ page }) => {
  await start(page);
  await lookup(page, 'thank good bye');
  const chips = page.getByTestId('chip-sign');
  await expect(page.getByTestId('play-all')).toContainText('Playing in order');
  await expect(chips.nth(0)).toHaveClass(/sel/);
  await expect(chips.nth(1)).toHaveClass(/sel/, { timeout: 25_000 });
  // after the last sign it stops, and the button plays the whole phrase again
  await expect(page.getByTestId('play-all')).toContainText('Play in order', { timeout: 25_000 });
  await page.getByTestId('play-all').click();
  await expect(chips.nth(0)).toHaveClass(/sel/);
  await expect(page.getByTestId('play-all')).toContainText('Playing in order');
});

test('a single word does not start a sequence', async ({ page }) => {
  await start(page);
  await lookup(page, 'thank');
  await expect(page.getByTestId('play-all')).toHaveCount(0);
  await expectPlaying(page);
});

test('Chinese input works', async ({ page }) => {
  await start(page);
  await lookup(page, '感謝');
  await expect(page.getByTestId('chip-sign')).toContainText('thank');
});

test('typeahead completes the word being typed', async ({ page }) => {
  await start(page);
  await input(page).fill('good b');
  await expect(page.getByTestId('typeahead')).toContainText('good bye');
  await page.getByTestId('typeahead').getByRole('option').first().click();
  await expect(input(page)).toHaveValue('good bye');
});

test('player: tap pauses and resumes, speed buttons set the playback rate', async ({ page }) => {
  await start(page);
  await lookup(page, 'good bye');
  await expectPlaying(page);
  const v = page.getByTestId('player-video');
  await v.click();
  await expect.poll(() => v.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
  // while paused the big play button covers the video; the toggle button resumes it too
  await page.getByRole('button', { name: 'Play', exact: true }).first().click();
  await expect.poll(() => v.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
  await page.getByTestId('speed-0.5').click();
  await expect.poll(() => v.evaluate((el: HTMLVideoElement) => el.playbackRate)).toBe(0.5);
  await page.getByTestId('replay').click();
  await expect.poll(() => v.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
});

test('a missing clip shows an error with retry, never a wrong video', async ({ page, request }) => {
  await request.get('/__ctl?notFound=T/thank_n.mp4');
  await start(page);
  await lookup(page, 'thank');
  await expect(page.getByTestId('player-error')).toContainText('could not be loaded');
  await expect(page.getByTestId('player-video')).toHaveCount(0);
  await request.get('/__ctl?allow=T/thank_n.mp4');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expectPlaying(page);
});

test('a clip watched once plays again with the network off', async ({ page, context }) => {
  await start(page);
  await lookup(page, 'good bye');
  await expectPlaying(page);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await ready(page);
  await page.getByTestId('tab-lookup').click();
  await lookup(page, 'good bye');
  await expectPlaying(page);
});

test('library: categories, search in English and Chinese, empty state, detail and back', async ({ page }) => {
  await start(page);
  await page.getByTestId('tab-library').click();
  await expect(page.getByTestId('library-count')).toHaveText('7 signs');
  await page.getByTestId('cat-etiquette').click();
  await expect(page.getByTestId('library-count')).toHaveText('3 signs');
  await page.getByTestId('cat-all').click();
  await page.getByTestId('library-search').fill('感');
  await expect(page.getByTestId('library-count')).toHaveText('4 signs');
  await page.getByTestId('library-search').fill('thnak'); // one typo
  await expect(page.getByTestId('library-count')).toHaveText('4 signs');
  await page.getByTestId('library-search').fill('zzzzz');
  await expect(page.getByTestId('library-empty')).toBeVisible();
  await page.getByTestId('library-search').fill('welcome');
  await page.getByTestId('library-row').first().click();
  await expect(page.getByTestId('detail-en')).toHaveText('welcome');
  await page.getByTestId('back').click();
  await expect(page.getByTestId('library-list')).toBeVisible();
});

test('phone layout: no sideways scroll and touch targets of at least 44px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await lookup(page, 'thank are good bye');
  await expect(page.getByTestId('sign-detail')).toBeVisible();
  const widths = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth }));
  expect(widths.doc).toBeLessThanOrEqual(widths.win);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('main button, nav button, main input, main a')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44))
      .map(({ el, r }) => `${el.tagName} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`),
  );
  expect(small).toEqual([]);
  await page.screenshot({ path: '.scratch/phone-lookup.png', fullPage: true });
});

test.describe('hand-shape and location drawings', () => {
  const loaded = (p: Page, testid: string) =>
    p.getByTestId(testid).first().locator('img').evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0);

  test('shown under the clip with captions, in Lookup and in the Library', async ({ page }) => {
    await start(page);
    await lookup(page, 'thank');
    await page.getByTestId('variant-thank_n').click();
    const pics = page.getByTestId('pictures');
    await expect(pics).toBeVisible();
    await expect(pics.getByTestId('pic-hand')).toHaveCount(1);
    await expect(pics.getByTestId('pic-place')).toHaveCount(1);
    await expect(pics).toContainText('Hand shape 手形');
    await expect(pics).toContainText('雞');
    await expect(pics).toContainText('palm');
    await expect.poll(() => loaded(page, 'pic-hand')).toBe(true);
    await expect.poll(() => loaded(page, 'pic-place')).toBe(true);
    // directly under the video, above the word
    const [video, pictures, word] = await Promise.all(
      ['player-video', 'pictures', 'detail-en'].map((id) => page.getByTestId(id).evaluate((el) => el.getBoundingClientRect().top)),
    );
    expect(video).toBeLessThan(pictures);
    expect(pictures).toBeLessThan(word);

    await page.getByTestId('tab-library').click();
    await page.getByTestId('library-search').fill('welcome');
    await page.getByTestId('library-row').first().click();
    await expect(page.getByTestId('pictures')).toBeVisible();
  });

  test('two different hand shapes are labelled hand 1 and hand 2', async ({ page }) => {
    await start(page);
    await lookup(page, 'thank');
    await page.getByTestId('variant-thank_s').click();
    await expect(page.getByTestId('pic-hand')).toHaveCount(2);
    await expect(page.getByTestId('pictures')).toContainText('hand 1');
    await expect(page.getByTestId('pictures')).toContainText('hand 2');
  });

  test('a sign with no drawing yet, or a drawing that fails to load, keeps an empty labelled tile', async ({ page }) => {
    await start(page);
    await page.getByTestId('tab-library').click();
    await page.getByTestId('library-search').fill('welcome');
    await page.getByTestId('library-row').first().click();
    await expect(page.getByTestId('pic-hand').getByTestId('pic-empty')).toBeVisible();
    await expect(page.getByTestId('pic-hand')).toContainText('矮');
    await page.getByTestId('back').click();
    // thank_b: its (replacement) file does not exist on the server
    await page.getByTestId('library-search').fill('thank');
    await page.getByTestId('library-row').filter({ hasText: 'Variant B' }).click();
    await expect(page.getByTestId('pic-hand').getByTestId('pic-empty')).toBeVisible();
  });

  test('signs without drawings show no empty section', async ({ page }) => {
    await start(page);
    await lookup(page, 'one');
    await expect(page.getByTestId('sign-detail')).toBeVisible();
    await expect(page.getByTestId('pictures')).toHaveCount(0);
  });

  test('phone layout: tiles fit the screen and the page does not scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page);
    await lookup(page, 'thank');
    await page.getByTestId('variant-thank_s').click();
    await expect(page.getByTestId('pictures')).toBeVisible();
    const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth }));
    expect(w.doc).toBeLessThanOrEqual(w.win);
  });
});
