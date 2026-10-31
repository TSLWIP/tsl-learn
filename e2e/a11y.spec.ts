import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { play, ready } from './helpers.ts';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function audit(page: Page, name: string, found: string[]) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  for (const v of r.violations) {
    found.push(`${name}: [${v.impact}] ${v.id} - ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(' ')} :: ${v.nodes[0]?.failureSummary?.split('\n')[1] ?? ''}`);
  }
}

test.beforeEach(async ({ request }) => {
  await request.get('/__reset');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`no accessibility violations on any screen (${scheme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme });
    const found: string[] = [];
    const tab = (id: string) => page.getByTestId(`tab-${id}`).click();

    await page.goto('/');
    await expect(page.getByTestId('onboarding')).toBeVisible();
    await audit(page, 'onboarding 1', found);
    await page.getByTestId('ob-next').click();
    await audit(page, 'onboarding 2', found);
    await page.getByTestId('ob-next').click();
    await audit(page, 'onboarding 3', found);
    await page.getByTestId('ob-start').click();
    await expect(page.getByTestId('home-count')).toBeVisible();

    await audit(page, 'learn (new user)', found);

    // lookup states
    await tab('lookup');
    await audit(page, 'lookup empty', found);
    await page.getByTestId('lookup-input').fill('thank are hello good bye');
    await page.getByTestId('lookup-go').click();
    await expect(page.getByTestId('sign-detail')).toBeVisible();
    await expect(page.getByTestId('player-video')).toBeVisible();
    await audit(page, 'lookup result (sign)', found);
    await page.getByTestId('add-to-deck').click();
    await audit(page, 'lookup add-to-deck menu', found);
    await page.getByTestId('chip-skipped').click();
    await audit(page, 'lookup skipped word', found);
    await page.getByTestId('chip-missing').click();
    await audit(page, 'lookup missing word', found);
    await page.getByTestId('lookup-input').fill('tha');
    await expect(page.getByTestId('typeahead')).toBeVisible();
    await audit(page, 'lookup typeahead open', found);

    // library
    await tab('library');
    await audit(page, 'library list', found);
    await page.getByTestId('library-search').fill('zzzz');
    await audit(page, 'library empty', found);
    await page.getByTestId('library-search').fill('thank');
    await page.getByTestId('library-row').first().click();
    await expect(page.getByTestId('player-video')).toBeVisible();
    await audit(page, 'library detail', found);

    // quiz screens
    await tab('learn');
    for (const mode of ['sign-to-meaning', 'meaning-to-sign', 'typed', 'flashcard', 'matching'] as const) {
      await page.getByTestId(`mode-${mode}`).click();
      await page.getByTestId('start-quick').click();
      await expect(page.getByTestId('quiz')).toBeVisible();
      await page.waitForTimeout(300);
      await audit(page, `quiz ${mode}`, found);
      if (mode === 'sign-to-meaning' || mode === 'meaning-to-sign') {
        await page.locator('[data-testid=option][data-correct=false]').first().click();
        await page.waitForTimeout(400); // let the short pop animation finish
        await audit(page, `quiz ${mode} feedback (wrong)`, found);
      }
      if (mode === 'flashcard') {
        await page.getByTestId('reveal').click();
        await audit(page, 'quiz flashcard revealed', found);
      }
      await page.getByTestId('end-session').click();
      await page.getByTestId('summary-done').click();
    }

    // a finished session with a miss, then the screens that depend on data
    await page.getByTestId('mode-mixed').click();
    await page.getByTestId('start-learn').click();
    await expect(page.getByTestId('intro-note')).toBeVisible();
    await audit(page, 'learn-new intro card', found);
    await play(page, { wrongFirst: true });
    await audit(page, 'summary with missed signs', found);
    await page.getByTestId('summary-done').click();
    await page.getByTestId('deck-name').fill('Mine');
    await page.getByTestId('deck-create').click();
    await audit(page, 'learn with data and decks', found);

    await tab('progress');
    await expect(page.getByTestId('mastery-card')).toBeVisible();
    await audit(page, 'progress with data', found);

    await tab('settings');
    await expect(page.getByTestId('storage-status')).toBeVisible();
    await audit(page, 'settings', found);

    expect(found, found.join('\n')).toEqual([]);
  });
}
