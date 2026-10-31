import { expect, test } from '@playwright/test';

// Runs only against the real dictionary and clips: REAL=1 npx playwright test --project=real
test.describe('real dictionary', () => {
  test.skip(process.env.REAL !== '1', 'needs REAL=1 and local clips');

  const go = async (page: import('@playwright/test').Page, text: string) => {
    await page.getByTestId('lookup-input').fill(text);
    await page.getByTestId('lookup-go').click();
  };

  test('required words behave honestly on real data', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-count')).toContainText('5,390 signs');

    await go(page, 'Hello');
    await expect(page.getByTestId('chip-sign')).toHaveCount(0);
    await expect(page.getByTestId('missing-panel')).toContainText('No sign found for “hello”');
    await page.screenshot({ path: '.scratch/real-hello.png' });

    await go(page, 'Thank you');
    await expect(page.getByTestId('detail-zh')).toHaveText('感謝');
    await expect(page.getByTestId('player-video')).toBeVisible();
    await expect.poll(() => page.getByTestId('player-video').evaluate((v: HTMLVideoElement) => v.readyState >= 2 && v.currentTime > 0), { timeout: 15_000 }).toBe(true);
    await page.screenshot({ path: '.scratch/real-thankyou.png' });

    await go(page, 'How are you');
    await expect(page.getByTestId('chips').locator('li')).toHaveCount(3);
    await expect(page.getByTestId('chip-skipped')).toContainText('are');

    await go(page, '1 2 5');
    await expect(page.getByTestId('chip-sign')).toHaveCount(3);

    await go(page, 'I eat rice');
    await page.screenshot({ path: '.scratch/real-eat-rice.png' });
  });

  test('library on 5,390 signs stays responsive', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-library').click();
    await expect(page.getByTestId('library-count')).toHaveText('5,390 signs');
    const t0 = Date.now();
    await page.getByTestId('library-search').fill('water');
    await expect(page.getByTestId('library-list').locator('li').first()).toContainText('water');
    expect(Date.now() - t0).toBeLessThan(1500);
    await page.getByTestId('library-search').fill('水');
    await expect(page.getByTestId('library-list').locator('li').first()).toBeVisible();
    await page.screenshot({ path: '.scratch/real-library.png' });
  });
});
