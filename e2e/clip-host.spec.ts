import { expect, test, type Page } from '@playwright/test';
import { ready } from './helpers.ts';

// Clips served from a different origin than the app, like a separate GitHub Pages site for the clips.
// The service worker is blocked so the test can rewrite content-source.json (a worker's own requests bypass page.route).
test.use({ serviceWorkers: 'block' });

const WITH_CORS = 'http://localhost:4176/';
const NO_CORS = 'http://localhost:4177/';

test.beforeEach(async ({ request }) => {
  await request.get('/__reset');
});

async function useHost(page: Page, baseUrl: string) {
  await page.route('**/content-source.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ baseUrl, maxConcurrent: 2, minGapMs: 250 }) }),
  );
  await page.goto('/');
  await ready(page);
}

const testSource = async (page: Page) => {
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('test-source').click();
  return page.getByTestId('settings-msg');
};

test('clips from a separate host play, and the app asks that host, not itself', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => r.url().endsWith('.mp4') && asked.push(r.url()));
  await useHost(page, WITH_CORS);
  await page.getByTestId('tab-lookup').click();
  await page.getByTestId('lookup-input').fill('good bye');
  await page.getByTestId('lookup-go').click();
  const v = page.getByTestId('player-video');
  await expect(v).toBeVisible();
  await expect.poll(() => v.evaluate((el: HTMLVideoElement) => el.readyState >= 2 && !el.paused && el.currentTime > 0), { timeout: 10_000 }).toBe(true);
  expect(asked.length).toBeGreaterThan(0);
  expect(asked.every((u) => u.startsWith(WITH_CORS))).toBe(true);
});

test('an offline pack downloads from the separate host, politely', async ({ page, request }) => {
  await useHost(page, WITH_CORS);
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('dl-etiquette').click();
  await expect(page.getByTestId('pack-status-etiquette')).toContainText('Saved');
  await expect(page.getByTestId('cached-count')).toContainText('3 (');
  expect((await (await request.get('/__stats')).json()).peak).toBeLessThanOrEqual(2);
});

test('"Test the clip source" confirms a working host', async ({ page }) => {
  await useHost(page, WITH_CORS);
  await expect(await testSource(page)).toContainText('The clip source works');
});

test('a host that does not allow other sites is explained, not blamed on the network', async ({ page }) => {
  await useHost(page, NO_CORS);
  const msg = await testSource(page);
  await expect(msg).toContainText('Access-Control-Allow-Origin');
  await page.getByTestId('tab-lookup').click();
  await page.getByTestId('lookup-input').fill('good bye');
  await page.getByTestId('lookup-go').click();
  await expect(page.getByTestId('player-error')).toContainText('could not be loaded');
  await expect(page.getByTestId('player-error')).toContainText('Test the clip source');
  await expect(page.getByTestId('player-video')).toHaveCount(0);
});

test('a wrong folder layout is reported as missing files', async ({ page }) => {
  await useHost(page, `${WITH_CORS}wrong-folder/`);
  await expect(await testSource(page)).toContainText('there is no file at');
});
