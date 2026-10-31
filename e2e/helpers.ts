import { expect, type Page } from '@playwright/test';

/**
 * Waits for the app to be usable. A fresh install (or one whose storage was cleared) starts with the
 * three-screen onboarding, so click through it with the default choices when it shows.
 */
export async function ready(page: Page): Promise<void> {
  await expect(page.getByTestId('onboarding').or(page.getByTestId('home-count'))).toBeVisible();
  if (await page.getByTestId('onboarding').isVisible()) {
    await page.getByTestId('ob-next').click();
    await page.getByTestId('ob-next').click();
    await page.getByTestId('ob-start').click();
  }
  await expect(page.getByTestId('home-count')).toBeVisible();
}

/**
 * Plays whatever the session shows until the summary appears. `wrongFirst` answers the first multiple-choice
 * question wrongly on purpose; `grade` is used for flashcards.
 */
export async function play(
  page: Page,
  o: { wrongFirst?: boolean; grade?: 'again' | 'hard' | 'good' | 'easy'; typo?: boolean; wrongRate?: number; rand?: () => number } = {},
) {
  const slip = () => !!o.wrongRate && (o.rand ?? Math.random)() < o.wrongRate;
  let missedOne = false;
  for (let i = 0; i < 80; i++) {
    if (await page.getByTestId('summary').count()) return;
    if (await page.getByTestId('feedback').count()) {
      await page.getByTestId('next').click();
    } else if (await page.getByTestId('intro-next').count()) {
      await page.getByTestId('intro-next').click();
    } else if (await page.getByTestId('reveal').count()) {
      await page.getByTestId('reveal').click();
    } else if (await page.getByTestId('grade-good').count()) {
      await page.getByTestId(`grade-${slip() ? 'again' : (o.grade ?? 'good')}`).click();
    } else if (await page.getByTestId('typed-input').count()) {
      const answer = (await page.locator('[data-answer]').getAttribute('data-answer'))!;
      await page.getByTestId('typed-input').fill(slip() ? 'zzzz' : o.typo ? answer.replace(/^(.)(.)/, '$2$1') : answer);
      await page.getByTestId('typed-check').click();
    } else if (await page.getByTestId('match-clip').count()) {
      const ids = await page.getByTestId('match-clip').evaluateAll((els) => els.map((e) => e.getAttribute('data-entry')!));
      for (const id of ids) {
        await page.locator(`[data-testid=match-clip][data-entry="${id}"]`).click();
        await page.locator(`[data-testid=match-word][data-entry="${id}"]`).click();
      }
    } else if (await page.getByTestId('option').count()) {
      const wrong: boolean = (!!o.wrongFirst && !missedOne) || slip();
      const sel = `[data-testid=option][data-correct=${wrong ? 'false' : 'true'}]`;
      missedOne = missedOne || wrong;
      await page.locator(sel).first().click();
    }
    await page.waitForTimeout(40);
  }
  throw new Error('session did not finish');
}

