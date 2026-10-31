import { expect, test, type Page } from '@playwright/test';

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
  await expect(page.getByTestId('home-count')).toBeVisible();
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
  await page.reload();
  await expect(page.getByTestId('home-count')).toBeVisible();
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

test('play in order advances from sign to sign by itself', async ({ page }) => {
  await start(page);
  await lookup(page, 'thank good bye');
  await page.getByTestId('play-all').click();
  const chips = page.getByTestId('chip-sign');
  await expect(chips.nth(0)).toHaveClass(/sel/);
  await expect(chips.nth(1)).toHaveClass(/sel/, { timeout: 25_000 });
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
  await page.getByTestId('typeahead').getByRole('option').first().locator('button').click();
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
  await expect(page.getByTestId('home-count')).toBeVisible();
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
