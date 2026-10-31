import type { AppContext } from '../boot/boot.ts';

/** Credits, sources and the honest state of the licensing, reachable from Settings. */
export function About({ ctx, onBack }: { ctx: AppContext; onBack: () => void }) {
  return (
    <section aria-labelledby="about-h" data-testid="about-screen">
      <button class="btn" data-testid="about-back" onClick={onBack}>
        ← Back to settings
      </button>
      <h1 id="about-h">About and credits</h1>

      <div class="card">
        <h2>The signs</h2>
        <p>
          Every clip, Chinese gloss, English gloss and sign description comes from the{' '}
          <a href="https://twtsl.ccu.edu.tw/" target="_blank" rel="noreferrer">
            Taiwan Sign Language Online Dictionary 台灣手語線上辭典
          </a>
          , built by the Institute of Linguistics at National Chung Cheng University (國立中正大學). The clips show Mr. Yushan Gu, former president of the Deaf Association of the Republic of China, and carry the “TSL@CCU” mark.
        </p>
        <p class="note">
          Background: Tsay (2019), <em>Taiwan Sign Language Online Dictionary Construction and Expansion</em>. In the dictionary,{' '}
          <strong>N</strong> and <strong>S</strong> mean the northern (Taipei) and southern (Tainan) dialects, and variants A, B, C are free variants listed by how often they are used.
        </p>
      </div>

      <div class="card" data-testid="about-licence">
        <h2>Reuse and permission</h2>
        <p>
          The dictionary does not publish terms of use, so this app does <strong>not</strong> claim any right to its content. It is an unofficial study tool, not affiliated with or endorsed by the university. It does not include the clips: it fetches them from a configurable source, slowly, and saves them on your own device.
        </p>
        <p class="note">If you are the rights holder and want something changed or removed, please say so and it will be.</p>
      </div>

      <div class="card">
        <h2>How honest is it?</h2>
        <ul>
          <li>TSL has its own grammar and word order, and uses face, head and body. <strong>Lookup shows dictionary signs in the order you typed. It is not a translation.</strong></li>
          <li>If the dictionary has no sign for a word, the app says so. It never shows a guessed or generic sign.</li>
          <li>The dictionary itself has gaps, for example no sign for “hello”, and some signs are missing a clip.</li>
        </ul>
      </div>

      <div class="card">
        <h2>Privacy</h2>
        <p>No accounts, no analytics, no tracking. Your progress, decks and settings stay in this browser. Use Settings → Backup to keep a copy.</p>
      </div>

      <div class="card">
        <h2>This copy</h2>
        <dl>
          <dt>App version</dt>
          <dd data-testid="about-version">{__APP_VERSION__}</dd>
          <dt>Sign list</dt>
          <dd>
            {ctx.lexicon.buildId} · {ctx.lexicon.entries.length.toLocaleString()} signs
          </dd>
          <dt>Clips come from</dt>
          <dd data-testid="about-source">{ctx.source.baseUrl}</dd>
        </dl>
        <p class="note">Built with Preact and Vite (MIT licensed). Chinese text uses your device&apos;s own fonts.</p>
      </div>
    </section>
  );
}
