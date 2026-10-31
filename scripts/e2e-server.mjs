// Test server for Playwright: serves dist/ over real HTTP (so the real service worker is in the loop),
// replaces the sign list and clips with a tiny fixture set, and lets tests inject failures.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '../../dist');
const PORT = Number(process.env.PORT ?? 4173);

import { existsSync, readFileSync } from 'node:fs';

// Real encoded clips are used when they exist locally (so playback can be tested); otherwise synthetic bytes.
const realDir = join(root, '../clips-360');
const clipBytes = (video, n, seed) => {
  const p = join(realDir, video);
  return existsSync(p) ? readFileSync(p) : Buffer.alloc(n, seed);
};
const FIXTURE_CLIPS = {
  'T/thank_a.mp4': clipBytes('T/thank_a.mp4', 1200, 1),
  'T/thank_b.mp4': clipBytes('T/thank_b.mp4', 900, 2),
  'G/good_bye.mp4': clipBytes('G/good_bye.mp4', 1500, 3),
  'O/one.mp4': clipBytes('O/one.mp4', 700, 4),
  'T/thank_n.mp4': clipBytes('T/thank_n.mp4', 800, 5),
  'T/thank_s.mp4': clipBytes('T/thank_s.mp4', 850, 6),
  'W/welcome_b.mp4': clipBytes('W/welcome_b.mp4', 600, 7),
};
const entry = (id, en, zh, category, video, extra = {}) => ({
  id, chinese: zh, english: en, category, dialect: 'both', video,
  sourceUrl: 'https://twtsl.ccu.edu.tw/', licenseNote: 'fixture', ...extra,
});
const lexicon = {
  schemaVersion: 1,
  buildId: 'e2e-1',
  categories: [
    { id: 'etiquette', en: 'Etiquette', zh: '禮貌' },
    { id: 'numbers', en: 'Numbers', zh: '數字' },
    { id: 'more', en: 'More signs', zh: '其他手語' },
  ],
  entries: [
    entry('thank_a', ['thank'], '感謝', 'etiquette', 'T/thank_a.mp4', { senseLabel: 'Variant A' }),
    entry('thank_b', ['thank'], '感謝', 'etiquette', 'T/thank_b.mp4', { senseLabel: 'Variant B' }),
    entry('good_bye', ['good bye', 'farewell'], '再見', 'etiquette', 'G/good_bye.mp4'),
    entry('one', ['one'], '一', 'numbers', 'O/one.mp4'),
    entry('thank_n', ['thank'], '感謝', 'more', 'T/thank_n.mp4', { dialect: 'north', description: 'Fixture description of how it is made.' }),
    entry('thank_s', ['thank'], '感謝', 'more', 'T/thank_s.mp4', { dialect: 'south' }),
    entry('welcome_b', ['welcome', 'greet'], '歡迎', 'more', 'W/welcome_b.mp4'),
  ],
};
const manifest = {
  buildId: 'e2e-1',
  clips: Object.entries(FIXTURE_CLIPS).map(([video, b]) => ({ video, size: b.length })),
};

// REAL=1: serve the real sign list (dist/data) and the encoded clips instead of the fixtures.
const REAL = process.env.REAL === '1';

const state = { notFound: new Set(), swSuffix: '', inflight: 0, peak: 0, clipHits: {}, delayMs: 40 };
const reset = () => {
  state.notFound.clear();
  state.swSuffix = '';
  state.inflight = 0;
  state.peak = 0;
  state.clipHits = {};
  state.delayMs = 40;
};

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = decodeURIComponent(url.pathname);
  const send = (code, body, type = 'text/plain') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };

  if (path === '/__reset') return reset(), send(200, 'ok');
  if (path === '/__ctl') {
    for (const v of url.searchParams.getAll('notFound')) state.notFound.add(v);
    for (const v of url.searchParams.getAll('allow')) state.notFound.delete(v);
    if (url.searchParams.has('delay')) state.delayMs = Number(url.searchParams.get('delay'));
    if (url.searchParams.has('swSuffix')) state.swSuffix = url.searchParams.get('swSuffix');
    return send(200, 'ok');
  }
  if (path === '/__stats') return send(200, JSON.stringify({ peak: state.peak, clipHits: state.clipHits }), 'application/json');

  if (!REAL && path === '/data/lexicon.json') return send(200, JSON.stringify(lexicon), 'application/json');
  if (!REAL && path === '/data/manifest.json') return send(200, JSON.stringify(manifest), 'application/json');

  if (path.startsWith('/clips/')) {
    const video = path.slice('/clips/'.length);
    state.clipHits[video] = (state.clipHits[video] ?? 0) + 1;
    state.peak = Math.max(state.peak, ++state.inflight);
    await new Promise((r) => setTimeout(r, state.delayMs));
    state.inflight--;
    if (REAL) {
      try {
        return send(200, await readFile(join(realDir, video)), 'video/mp4');
      } catch {
        return send(404, 'nope');
      }
    }
    if (state.notFound.has(video) || !FIXTURE_CLIPS[video]) return send(404, 'nope');
    return send(200, FIXTURE_CLIPS[video], 'video/mp4');
  }

  const file = normalize(path === '/' ? '/index.html' : path).replace(/^([/\\])+/, '');
  try {
    let body = await readFile(join(root, file));
    if (file === 'sw.js' && state.swSuffix) {
      // Simulates a new deploy: different bytes and a different cache name.
      body = Buffer.from(body.toString().replace(/const VERSION = '([^']*)'/, `const VERSION = '$1${state.swSuffix}'`));
    }
    send(200, body, types[extname(file)] ?? 'application/octet-stream');
  } catch {
    send(404, 'not found');
  }
}).listen(PORT, () => console.log(`e2e server on ${PORT}`));
