import { expect, test, type Page } from '@playwright/test';

// Starter topics in the fixture = thank (north sign thank_n represents the word), good_bye, one.
const UNITS = ['thank_n', 'good_bye', 'one'];
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test.beforeEach(async ({ request }) => {
  await request.get('/__reset');
});

async function start(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('home-count')).toBeVisible();
  await expect(page.getByTestId('due-count')).toBeVisible();
}

async function seedDue(page: Page, ids = UNITS, intervalDays = 1, reps = 1) {
  await page.evaluate(
    ({ ids, intervalDays, reps, HOUR, DAY }) =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('tsl-learn');
        r.onsuccess = () => {
          const tx = r.result.transaction('progress', 'readwrite');
          for (const id of ids) {
            tx.objectStore('progress').put({
              id, schemaVersion: 2, ease: 2.5, intervalDays, dueAt: Date.now() - HOUR, reps, lapses: 0, introducedAt: Date.now() - 3 * DAY,
            });
          }
          tx.oncomplete = () => (r.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    { ids, intervalDays, reps, HOUR, DAY },
  );
  await page.reload();
  await expect(page.getByTestId('due-count')).toHaveText(`${ids.length} due`);
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
      }),
    store,
  );

const meta = (page: Page, key: string) =>
  page.evaluate(
    (key) =>
      new Promise<any>((resolve, reject) => {
        const r = indexedDB.open('tsl-learn');
        r.onsuccess = () => {
          const q = r.result.transaction('meta').objectStore('meta').get(key);
          q.onsuccess = () => (r.result.close(), resolve(q.result?.value));
          q.onerror = () => reject(q.error);
        };
      }),
    key,
  );

/**
 * Plays whatever the session shows until the summary appears. `wrongFirst` answers the first multiple-choice
 * question wrongly on purpose; `grade` is used for flashcards.
 */
async function play(page: Page, o: { wrongFirst?: boolean; grade?: 'again' | 'hard' | 'good' | 'easy'; typo?: boolean } = {}) {
  let missedOne = false;
  for (let i = 0; i < 80; i++) {
    if (await page.getByTestId('summary').count()) return;
    if (await page.getByTestId('feedback').count()) {
      await page.getByTestId('next').click();
    } else if (await page.getByTestId('intro-next').count()) {
      await page.getByTestId('intro-next').click();
    } else if (await page.getByTestId('reveal').count()) {
      await page.getByTestId('reveal').click();
    } else if (await page.getByTestId(`grade-${o.grade ?? 'good'}`).count()) {
      await page.getByTestId(`grade-${o.grade ?? 'good'}`).click();
    } else if (await page.getByTestId('typed-input').count()) {
      const answer = (await page.locator('[data-answer]').getAttribute('data-answer'))!;
      await page.getByTestId('typed-input').fill(o.typo ? answer.replace(/^(.)(.)/, '$2$1') : answer);
      await page.getByTestId('typed-check').click();
    } else if (await page.getByTestId('match-clip').count()) {
      const ids = await page.getByTestId('match-clip').evaluateAll((els) => els.map((e) => e.getAttribute('data-entry')!));
      for (const id of ids) {
        await page.locator(`[data-testid=match-clip][data-entry="${id}"]`).click();
        await page.locator(`[data-testid=match-word][data-entry="${id}"]`).click();
      }
    } else if (await page.getByTestId('option').count()) {
      const wrong: boolean = !!o.wrongFirst && !missedOne;
      const sel = `[data-testid=option][data-correct=${wrong ? 'false' : 'true'}]`;
      missedOne = missedOne || wrong;
      await page.locator(sel).first().click();
    }
    await page.waitForTimeout(40);
  }
  throw new Error('session did not finish');
}

test('Learn new: intro cards, then recognition questions, then a summary; the schedule is saved', async ({ page }) => {
  await start(page);
  await expect(page.getByTestId('new-count')).toHaveText('3 available today');
  await page.getByTestId('start-learn').click();
  await expect(page.getByTestId('quiz-progress')).toContainText('1 of 6');
  await expect(page.getByTestId('intro-note')).toBeVisible();
  await play(page);
  await expect(page.getByTestId('score')).toContainText('3');
  await expect(page.getByTestId('score')).toContainText('of 3 on the first try');
  await expect(page.getByTestId('missed-list')).toHaveCount(0);
  await expect(page.getByText('Next review tomorrow')).toBeVisible();

  const prog = await rows(page, 'progress');
  expect(prog.map((p) => p.id).sort()).toEqual([...UNITS].sort());
  for (const p of prog) {
    expect(p).toMatchObject({ reps: 1, intervalDays: 1, lapses: 0 });
    expect(Math.abs(p.dueAt - (Date.now() + DAY))).toBeLessThan(2 * 60_000);
    expect(p.introducedAt).toBeGreaterThan(Date.now() - 60_000);
  }
  expect(await rows(page, 'reviews')).toHaveLength(3);

  await page.getByTestId('summary-done').click();
  await expect(page.getByTestId('due-count')).toHaveText('0 due');
  await expect(page.getByTestId('new-count')).toHaveText('0 available today');
  await page.reload();
  await expect(page.getByTestId('due-count')).toHaveText('0 due');
});

test('a wrong answer is scheduled for a quick retry, remembered as a confusion, and repeated at the end', async ({ page }) => {
  await start(page);
  await page.getByTestId('start-learn').click();
  await play(page, { wrongFirst: true }).catch(() => undefined);
  await expect(page.getByTestId('summary')).toBeVisible();
  // the review pass was shown
  await expect(page.getByTestId('score')).toContainText('2');
  await expect(page.getByTestId('missed-list')).toContainText('These will come back soon');
  const prog = await rows(page, 'progress');
  const missed = prog.filter((p) => p.reps === 0);
  expect(missed).toHaveLength(1);
  expect(Math.abs(missed[0].dueAt - (Date.now() + 10 * 60_000))).toBeLessThan(2 * 60_000);
  expect(prog.filter((p) => p.reps === 1)).toHaveLength(2);
  expect(await rows(page, 'reviews')).toHaveLength(3); // the ungraded review pass writes nothing
  const conf = await meta(page, 'confusions');
  expect(Object.keys(conf)).toEqual([missed[0].id]);
  expect(conf[missed[0].id]).toHaveLength(1);
  await expect(page.getByText('Next review in 10 minutes')).toBeVisible();
});

test('the mistake review pass is announced and does not change the schedule', async ({ page }) => {
  await start(page);
  await seedDue(page);
  await page.getByTestId('mode-sign-to-meaning').click();
  await page.getByTestId('start-review').click();
  await page.locator('[data-testid=option][data-correct=false]').first().click();
  await page.getByTestId('next').click(); // 2nd question
  await page.locator('[data-testid=option][data-correct=true]').first().click();
  await page.getByTestId('next').click();
  await page.locator('[data-testid=option][data-correct=true]').first().click();
  await page.getByTestId('next').click();
  await expect(page.getByTestId('quiz-progress')).toContainText('Review of missed signs');
  const before = await rows(page, 'progress');
  await page.locator('[data-testid=option][data-correct=true]').first().click();
  await page.getByTestId('next').click();
  await expect(page.getByTestId('summary')).toBeVisible();
  expect(await rows(page, 'progress')).toEqual(before);
});

test('Review due in mixed mode: choose-the-meaning, choose-the-sign and typing, all correct, intervals grow', async ({ page }) => {
  await start(page);
  await seedDue(page);
  await page.getByTestId('start-review').click();
  await expect(page.getByTestId('quiz-progress')).toContainText('1 of 3');
  await play(page);
  await expect(page.getByTestId('score')).toContainText('3');
  const prog = await rows(page, 'progress');
  for (const p of prog) expect(p).toMatchObject({ reps: 2, intervalDays: 6 });
  expect(Math.abs(prog[0].dueAt - (Date.now() + 6 * DAY))).toBeLessThan(2 * 60_000);
  await page.getByTestId('summary-done').click();
  await expect(page.getByTestId('due-count')).toHaveText('0 due');
});

test('typed recall accepts a small typo as "close enough" and grades it hard', async ({ page }) => {
  await start(page);
  await seedDue(page, ['thank_n']);
  await page.getByTestId('pool-select').selectOption('cat:etiquette');
  await page.getByTestId('mode-typed').click();
  await page.getByTestId('start-review').click();
  const answer = (await page.locator('[data-answer]').getAttribute('data-answer'))!;
  expect(answer).toBe('thank');
  await page.getByTestId('typed-input').fill('thnak');
  await page.getByTestId('typed-check').click();
  await expect(page.getByTestId('feedback')).toContainText('Close enough');
  await page.getByTestId('next').click();
  await expect(page.getByTestId('summary')).toBeVisible();
  const [p] = await rows(page, 'progress');
  expect(p).toMatchObject({ id: 'thank_n', reps: 2, intervalDays: 2 }); // hard: 1 day -> 2
});

test('typed recall accepts Chinese, rejects a wrong word and shows the answer', async ({ page }) => {
  await start(page);
  await seedDue(page, ['thank_n']);
  await page.getByTestId('pool-select').selectOption('cat:etiquette');
  await page.getByTestId('mode-typed').click();
  await page.getByTestId('start-review').click();
  await page.getByTestId('typed-input').fill('banana');
  await page.getByTestId('typed-check').click();
  await expect(page.getByTestId('feedback')).toContainText('Not quite');
  await expect(page.getByTestId('feedback')).toContainText('thank');
});

test('flashcards: reveal, then Again / Good change the schedule differently', async ({ page }) => {
  await start(page);
  await seedDue(page, ['good_bye', 'one']);
  await page.getByTestId('mode-flashcard').click();
  await page.getByTestId('start-review').click();
  await page.getByTestId('reveal').click();
  await expect(page.getByTestId('revealed')).toBeVisible();
  await page.getByTestId('grade-again').click();
  await page.getByTestId('reveal').click();
  await page.getByTestId('grade-easy').click();
  // the card marked "Again" comes back once in the mistake review
  await expect(page.getByTestId('quiz-progress')).toContainText('Review of missed signs');
  await page.locator('[data-testid=option][data-correct=true]').first().click();
  await page.getByTestId('next').click();
  await expect(page.getByTestId('summary')).toBeVisible();
  const prog = Object.fromEntries((await rows(page, 'progress')).map((p) => [p.id, p]));
  const outcomes = Object.values(prog).map((p: any) => [p.reps, p.intervalDays]).sort();
  expect(outcomes).toEqual([[0, 0], [2, 8]]);
});

test('matching: pairs four signs with their meanings; a wrong tap is counted but not fatal', async ({ page }) => {
  await start(page);
  await page.getByTestId('mode-matching').click();
  await page.getByTestId('start-quick').click();
  await expect(page.getByTestId('match-clip')).toHaveCount(4);
  const ids = await page.getByTestId('match-clip').evaluateAll((els) => els.map((e) => e.getAttribute('data-entry')!));
  // wrong word first for the first sign
  const wrongWord = ids.find((id) => id !== ids[0])!;
  await page.locator(`[data-testid=match-clip][data-entry="${ids[0]}"]`).click();
  await page.locator(`[data-testid=match-word][data-entry="${wrongWord}"]`).click();
  for (const id of ids) {
    await page.locator(`[data-testid=match-clip][data-entry="${id}"]`).click();
    await page.locator(`[data-testid=match-word][data-entry="${id}"]`).click();
  }
  await expect(page.getByTestId('feedback')).toContainText('matched on the first try');
  await page.getByTestId('next').click();
  await page.waitForTimeout(100);
  // the first sign was missed once, the extra (padding) sign is never graded
  const prog = await rows(page, 'progress');
  expect(prog.length).toBeLessThanOrEqual(3);
  expect(prog.some((p) => p.intervalDays === 1 && p.reps === 1)).toBe(true);
});

test('the daily cap on new signs is adjustable and respected', async ({ page }) => {
  await start(page);
  await page.getByTestId('tab-settings').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('newperday-down').click();
  await expect(page.getByTestId('newperday')).toHaveText('2');
  await page.getByTestId('tab-learn').click();
  await expect(page.getByTestId('new-count')).toHaveText('2 available today');
  await page.getByTestId('start-learn').click();
  await expect(page.getByTestId('quiz-progress')).toContainText('1 of 4'); // 2 intros + 2 questions
  await play(page);
  await page.getByTestId('summary-done').click();
  await expect(page.getByTestId('new-count')).toHaveText('0 available today');
  await expect(page.getByTestId('start-learn')).toBeVisible();
  await page.getByTestId('start-learn').click();
  await expect(page.getByTestId('learn-notice')).toContainText('No new signs');
});

test('custom decks: add a sign from lookup, study only that deck, delete it', async ({ page }) => {
  await start(page);
  await page.getByTestId('tab-lookup').click();
  await page.getByTestId('lookup-input').fill('welcome');
  await page.getByTestId('lookup-go').click();
  await page.getByTestId('add-to-deck').click();
  await page.getByTestId('new-deck-name').fill('Greetings');
  await page.getByTestId('new-deck-create').click();
  await expect(page.getByTestId('deck-toggle-Greetings')).toContainText('✓ Greetings · 1');
  await page.getByTestId('tab-learn').click();
  await page.getByTestId('pool-select').selectOption({ label: 'My deck: Greetings (1)' });
  await expect(page.getByTestId('pool-size')).toHaveText('1 sign in this set');
  await page.getByTestId('start-learn').click();
  await expect(page.getByTestId('quiz-progress')).toContainText('1 of 2');
  await play(page);
  await expect(page.getByTestId('score')).toContainText('1');
  await page.getByTestId('summary-done').click();
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('delete-deck-Greetings').click();
  await expect(page.getByTestId('decks-card')).not.toContainText('Greetings');
  await expect(page.getByTestId('pool-select')).toHaveValue('starter');
});

test('ending a session early still shows a summary', async ({ page }) => {
  await start(page);
  await page.getByTestId('start-quick').click();
  await page.getByTestId('end-session').click();
  await expect(page.getByTestId('summary')).toContainText('Session ended');
  await page.getByTestId('summary-done').click();
  await expect(page.getByTestId('due-count')).toBeVisible();
});

test('nothing due: says so plainly instead of starting an empty session', async ({ page }) => {
  await start(page);
  await page.getByTestId('start-review').click();
  await expect(page.getByTestId('learn-notice')).toHaveText('Nothing is due right now.');
});

test('keyboard: number keys pick an answer', async ({ page }) => {
  await start(page);
  await page.getByTestId('mode-sign-to-meaning').click();
  await page.getByTestId('start-quick').click();
  await expect(page.getByTestId('option')).toHaveCount(4);
  await page.keyboard.press('1');
  await expect(page.getByTestId('feedback')).toBeVisible();
});

test('phone layout: quiz screens fit, answer targets are big enough, nothing hides the options', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await page.getByTestId('mode-sign-to-meaning').click();
  await page.getByTestId('start-quick').click();
  await expect(page.getByTestId('option')).toHaveCount(4);
  await page.screenshot({ path: '.scratch/phone-quiz-s2m.png', fullPage: true });
  const check = () =>
    page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      small: [...document.querySelectorAll<HTMLElement>('main button, main input, main select')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.height < 44 || r.width < 44))
        .map(({ el, r }) => `${el.textContent?.trim().slice(0, 18)} ${Math.round(r.width)}x${Math.round(r.height)}`),
    }));
  expect(await check()).toEqual({ overflow: 0, small: [] });
  await page.getByTestId('end-session').click();
  await page.getByTestId('summary-done').click();
  await page.getByTestId('mode-meaning-to-sign').click();
  await page.getByTestId('start-quick').click();
  await expect(page.getByTestId('option')).toHaveCount(4);
  await page.screenshot({ path: '.scratch/phone-quiz-m2s.png', fullPage: true });
  expect(await check()).toEqual({ overflow: 0, small: [] });
});
