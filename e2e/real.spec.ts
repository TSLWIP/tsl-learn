import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ready } from './helpers.ts';

// Runs only against the real dictionary and clips: REAL=1 npx playwright test --project=real
test.describe('real dictionary', () => {
  test.skip(process.env.REAL !== '1', 'needs REAL=1 and local clips');

  const go = async (page: import('@playwright/test').Page, text: string) => {
    await page.getByTestId('lookup-input').fill(text);
    await page.getByTestId('lookup-go').click();
  };

  test('required words behave honestly on real data', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await expect(page.getByTestId('home-count')).toContainText('5,390 signs');
    await page.getByTestId('tab-lookup').click();

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
    await ready(page);
    await page.getByTestId('tab-library').click();
    await expect(page.getByTestId('library-count')).toHaveText('5,390 signs');
    // every category bubble is wide enough for its own text, on a desktop and on a phone (they once squashed to 44px)
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const cramped = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[aria-label="Categories"] button')]
          .filter((b) => b.scrollWidth > b.clientWidth + 1)
          .map((b) => b.textContent),
      );
      expect(cramped, `category bubbles whose text spills out at ${width}px`).toEqual([]);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    const t0 = Date.now();
    await page.getByTestId('library-search').fill('water');
    await expect(page.getByTestId('library-list').locator('li').first()).toContainText('water');
    expect(Date.now() - t0).toBeLessThan(1500);
    await page.getByTestId('library-search').fill('水');
    await expect(page.getByTestId('library-list').locator('li').first()).toBeVisible();
    await page.screenshot({ path: '.scratch/real-library.png' });
  });

  test('a real Learn new session on the starter topics: quiz options look sensible and clips play', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await expect(page.getByTestId('pool-size')).toBeVisible();
    const pool = await page.getByTestId('pool-size').textContent();
    console.log('starter pool:', pool);
    await page.getByTestId('start-learn').click();
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      if (await page.getByTestId('summary').count()) break;
      if (await page.getByTestId('feedback').count()) await page.getByTestId('next').click();
      else if (await page.getByTestId('reveal').count()) {
        await expect.poll(() => page.getByTestId('player-video').evaluate((v: HTMLVideoElement) => v.readyState >= 2 && v.currentTime > 0), { timeout: 15_000 }).toBe(true);
        if (!seen.length) await page.screenshot({ path: '.scratch/real-intro.png' });
        seen.push('intro');
        await page.getByTestId('reveal').click();
        await page.getByTestId('intro-next').click();
      } else if (await page.getByTestId('option').count()) {
        const labels = await page.getByTestId('option').allTextContents();
        seen.push(labels.join(' | '));
        if (seen.filter((x) => x.includes('|')).length === 1) await page.screenshot({ path: '.scratch/real-quiz.png' });
        await page.locator('[data-testid=option][data-correct=true]').first().click();
      }
      await page.waitForTimeout(60);
    }
    console.log(seen.join(' // '));
    await expect(page.getByTestId('summary')).toBeVisible();
    await expect(page.getByTestId('score')).toContainText('5');
  });

  test('real-data screens pass the accessibility audit (light and dark)', async ({ page }) => {
    test.setTimeout(90_000);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      await ready(page);
      const found: string[] = [];
      const audit = async (name: string) => {
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
        for (const v of r.violations) found.push(`${scheme} ${name}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`);
      };
      await audit('learn');
      await page.getByTestId('tab-lookup').click();
      await page.getByTestId('lookup-input').fill('I want to eat rice, hello');
      await page.getByTestId('lookup-go').click();
      await expect(page.getByTestId('chips')).toBeVisible();
      await audit('lookup');
      await page.getByTestId('tab-library').click();
      await audit('library');
      await page.getByTestId('library-search').fill('水');
      await audit('library (Chinese search)');
      await page.getByTestId('tab-settings').click();
      await audit('settings');
      expect(found, found.join(' | ')).toEqual([]);
    }
  });
});
