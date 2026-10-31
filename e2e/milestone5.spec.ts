import { expect, test, type Page } from '@playwright/test';
import { play, ready } from './helpers.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test.beforeEach(async ({ request }) => {
  await request.get('/__reset');
});

async function start(page: Page) {
  await page.goto('/');
  await ready(page);
}
const tab = (page: Page, id: string) => page.getByTestId(`tab-${id}`).click();

const seedReviews = (page: Page, times: number[]) =>
  page.evaluate(
    (times) =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('tsl-learn');
        r.onsuccess = () => {
          const tx = r.result.transaction('reviews', 'readwrite');
          for (const at of times) tx.objectStore('reviews').add({ schemaVersion: 2, signId: 'one', at, grade: 'good', mode: 'flashcard' });
          tx.oncomplete = () => (r.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    times,
  );

test.describe('onboarding', () => {
  test('three screens: what it is, the honest TSL note, then dialect and goal; choices are saved', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('onboarding')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Learn Taiwan Sign Language');
    await page.getByTestId('ob-next').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('A note about TSL');
    await expect(page.getByTestId('onboarding')).toContainText('not signed English');
    await expect(page.getByTestId('onboarding')).toContainText('not a translation');
    await page.getByTestId('ob-back').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Learn Taiwan Sign Language');
    await page.getByTestId('ob-next').click();
    await page.getByTestId('ob-next').click();
    await expect(page.getByTestId('ob-north')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('ob-south').click();
    await page.getByTestId('ob-goal-40').click();
    await page.getByTestId('ob-start').click();
    await expect(page.getByTestId('home-count')).toBeVisible();
    await expect(page.getByTestId('strip-today')).toContainText('/ 40');

    await page.reload();
    await expect(page.getByTestId('home-count')).toBeVisible(); // no onboarding second time
    await expect(page.getByTestId('onboarding')).toHaveCount(0);
    await tab(page, 'settings');
    await expect(page.getByTestId('dialect-south')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('goal')).toHaveText('40');
    await tab(page, 'lookup');
    await page.getByTestId('lookup-input').fill('thank');
    await page.getByTestId('lookup-go').click();
    await expect(page.getByTestId('detail-dialect')).toContainText('Southern');
  });

  test('keyboard: focus lands on each screen heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('onboarding')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('ob-h');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter'); // Next
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('A note about TSL');
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('ob-h');
  });
});

test.describe('progress', () => {
  test('empty state before any practice', async ({ page }) => {
    await start(page);
    await tab(page, 'progress');
    await expect(page.getByTestId('progress-empty')).toContainText('Nothing here yet');
  });

  test('after a session: today, run, mastery, topics and weekly table reflect it', async ({ page }) => {
    await start(page);
    await page.getByTestId('start-learn').click();
    await play(page);
    await page.getByTestId('summary-done').click();
    await expect(page.getByTestId('strip-today')).toContainText('Today 3 / 20');
    await expect(page.getByTestId('strip-run')).toHaveText('1-day run');

    await tab(page, 'progress');
    await expect(page.getByTestId('today-text')).toContainText('3 of 20 answers');
    await expect(page.getByTestId('streak')).toContainText('1');
    await expect(page.getByTestId('mastery-learning')).toContainText('3');
    await expect(page.getByTestId('mastery-new')).toContainText('0');
    await expect(page.getByTestId('topic-etiquette')).toContainText('2 signs'); // thank + good bye
    await expect(page.getByTestId('topic-etiquette')).toContainText('2 met');
    await expect(page.getByTestId('total-answers')).toHaveText('3');
    await expect(page.getByTestId('week').locator('tbody tr').last()).toContainText('3');
  });

  test('a missed day does not break the run', async ({ page }) => {
    await start(page);
    const now = Date.now();
    // practised 3 and 2 days ago, nothing yesterday, nothing yet today
    await seedReviews(page, [now - 3 * DAY, now - 2 * DAY]);
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('strip-run')).toHaveText('2-day run');
    await tab(page, 'progress');
    await expect(page.getByTestId('streak')).toContainText('2');
  });

  test('two missed days in a row start fresh, without any scolding', async ({ page }) => {
    await start(page);
    await seedReviews(page, [Date.now() - 5 * DAY]);
    await page.reload();
    await ready(page);
    await tab(page, 'progress');
    await expect(page.getByTestId('streak')).toContainText('fresh start');
  });
});

test.describe('backup reminder and restore', () => {
  test('appears quietly once there is history, never blocks, and "Later" holds it off', async ({ page }) => {
    await start(page);
    await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
    const now = Date.now();
    await seedReviews(page, Array.from({ length: 60 }, (_, i) => now - i * 60_000));
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('backup-reminder')).toBeVisible();
    await expect(page.getByTestId('backup-reminder')).toContainText('Keep your progress safe');
    await page.getByTestId('start-quick').click(); // not blocked
    await expect(page.getByTestId('quiz')).toBeVisible();
    await page.getByTestId('end-session').click();
    await page.getByTestId('summary-done').click();
    await page.getByTestId('reminder-later').click();
    await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
    await tab(page, 'progress');
    await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
  });

  test('saving a backup from the reminder clears it and is recorded in Settings', async ({ page }) => {
    await start(page);
    await seedReviews(page, Array.from({ length: 55 }, (_, i) => Date.now() - i * 60_000));
    await page.reload();
    await ready(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('reminder-export').click()]);
    expect(dl.suggestedFilename()).toMatch(/^tsl-learn-backup-\d{4}-\d{2}-\d{2}\.json$/);
    await expect(page.getByTestId('backup-reminder')).toHaveCount(0);
    await tab(page, 'settings');
    await expect(page.getByTestId('last-backup')).toContainText('Last backup:');
  });

  test('importing the wrong kind of file explains itself and changes nothing', async ({ page }) => {
    await start(page);
    await tab(page, 'settings');
    await page.getByTestId('import').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('not json at all') });
    await expect(page.getByTestId('settings-msg')).toContainText('could not be read');
    await page.getByTestId('import').setInputFiles({ name: 'y.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
    await expect(page.getByTestId('settings-msg')).toContainText('not a TSL Learn backup');
    await page.getByTestId('import').setInputFiles({ name: 'z.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'tsl-learn', schemaVersion: 99 })) });
    await expect(page.getByTestId('settings-msg')).toContainText('newer version');
  });

  test('a real round trip: practise, export, lose everything, import, and it is all back', async ({ page }) => {
    await start(page);
    await page.getByTestId('start-learn').click();
    await play(page);
    await page.getByTestId('summary-done').click();
    await tab(page, 'settings');
    await page.getByTestId('dialect-south').click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
    const file = (await dl.path())!;

    await page.evaluate(() => new Promise<void>((res) => { const r = indexedDB.deleteDatabase('tsl-learn'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
    await page.reload();
    await ready(page); // onboarding again: the data really is gone
    await tab(page, 'progress');
    await expect(page.getByTestId('progress-empty')).toBeVisible();
    await tab(page, 'settings');
    await page.getByTestId('import').setInputFiles(file);
    await expect(page.getByTestId('settings-msg')).toContainText('Imported 3 signs and 3 reviews');
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('strip-today')).toContainText('Today 3');
    await tab(page, 'progress');
    await expect(page.getByTestId('mastery-learning')).toContainText('3');
  });
});

test.describe('offline packs', () => {
  test('shows progress, can be stopped, resumed, and removed', async ({ page, request }) => {
    await request.get('/__ctl?delay=500');
    await start(page);
    await tab(page, 'settings');
    await expect(page.getByTestId('pack-status-etiquette')).toContainText('0 of 3 saved');
    await page.getByTestId('dl-etiquette').click();
    await expect(page.getByTestId('dl-progress')).toBeVisible();
    await page.getByTestId('cancel-etiquette').click();
    await expect(page.getByTestId('settings-msg')).toContainText('Stopped');
    const partial = await page.getByTestId('pack-status-etiquette').textContent();
    expect(partial).not.toContain('0 of 3');
    expect(partial).not.toContain('Saved');
    await request.get('/__ctl?delay=40');
    await page.getByTestId('dl-etiquette').click(); // now "Download rest"
    await expect(page.getByTestId('pack-status-etiquette')).toContainText('Saved');
    await expect(page.getByTestId('cached-count')).toContainText('3 (');
    await page.getByTestId('rm-etiquette').click();
    await expect(page.getByTestId('pack-status-etiquette')).toContainText('0 of 3 saved');
    await expect(page.getByTestId('cached-count')).toContainText('0 (');
  });
});

test.describe('appearance', () => {
  const bg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const DARK = 'rgb(22, 24, 29)';
  const LIGHT = 'rgb(246, 241, 233)';

  test('auto follows the device; light and dark override it', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await start(page);
    expect(await bg(page)).toBe(DARK);
    await tab(page, 'settings');
    await page.getByTestId('theme-light').click();
    expect(await bg(page)).toBe(LIGHT);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.getByTestId('theme-dark').click();
    expect(await bg(page)).toBe(DARK);
    await page.getByTestId('theme-auto').click();
    expect(await bg(page)).toBe(LIGHT);
    await page.reload();
    await ready(page);
    expect(await bg(page)).toBe(LIGHT);
  });

  test('reduced motion: clips start paused with a play button, and still play on request', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await start(page);
    await tab(page, 'lookup');
    await page.getByTestId('lookup-input').fill('good bye');
    await page.getByTestId('lookup-go').click();
    const v = page.getByTestId('player-video');
    await expect(v).toBeVisible();
    await page.waitForTimeout(600);
    expect(await v.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await expect.poll(() => v.evaluate((el: HTMLVideoElement) => !el.paused)).toBe(true);
  });
});

test.describe('keyboard and focus', () => {
  test('skip link is the first stop and moves focus to the content', async ({ page }) => {
    await start(page);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main');
  });

  test('changing tab updates the page title and moves focus to the new content', async ({ page }) => {
    await start(page);
    await expect(page).toHaveTitle('Learn · TSL Learn');
    await tab(page, 'progress');
    await expect(page).toHaveTitle('Progress · TSL Learn');
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('main');
  });

  test('a full lookup works from the keyboard and focus is always visibly marked', async ({ page }) => {
    await start(page);
    await tab(page, 'lookup');
    await page.getByTestId('lookup-input').focus();
    await page.keyboard.type('thank');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('chip-sign')).toHaveCount(1);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const cs = getComputedStyle(el);
        return { tag: el.tagName, width: cs.outlineWidth, style: cs.outlineStyle, shadow: cs.boxShadow };
      });
      expect(ring.style !== 'none' || ring.shadow !== 'none', `focus ring on ${ring.tag}`).toBe(true);
    }
  });
});

test.describe('phone layout of the new screens', () => {
  test('onboarding, progress and settings fit and have big enough targets', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('onboarding')).toBeVisible();
    const check = () =>
      page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        small: [...document.querySelectorAll<HTMLElement>('button, input:not(.sr-only), select, a')]
          // a checkbox is operated through its label, which is the real target
          .map((el) => ({ el, r: ((el as HTMLInputElement).type === 'checkbox' ? el.closest('label') ?? el : el).getBoundingClientRect() }))
          .filter(({ r, el }) => r.width > 0 && !el.classList.contains('skip') && (r.height < 44 || r.width < 44))
          .map(({ el, r }) => `${el.textContent?.trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`),
      }));
    await page.screenshot({ path: '.scratch/phone-onboarding-1.png' });
    expect(await check()).toEqual({ overflow: 0, small: [] });
    await page.getByTestId('ob-next').click();
    await page.getByTestId('ob-next').click();
    await page.screenshot({ path: '.scratch/phone-onboarding-3.png' });
    expect(await check()).toEqual({ overflow: 0, small: [] });
    await page.getByTestId('ob-start').click();
    await page.getByTestId('start-learn').click();
    await play(page);
    await page.getByTestId('summary-done').click();
    await page.screenshot({ path: '.scratch/phone-learn.png', fullPage: true });
    expect(await check()).toEqual({ overflow: 0, small: [] });
    await tab(page, 'progress');
    await page.screenshot({ path: '.scratch/phone-progress.png', fullPage: true });
    expect(await check()).toEqual({ overflow: 0, small: [] });
    await tab(page, 'settings');
    await page.screenshot({ path: '.scratch/phone-settings.png', fullPage: true });
    expect(await check()).toEqual({ overflow: 0, small: [] });
  });
});
