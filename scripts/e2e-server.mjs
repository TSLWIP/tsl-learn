// Test server for Playwright: serves dist/ over real HTTP (so the real service worker is in the loop),
// replaces the sign list and clips with a tiny fixture set, and lets tests inject failures.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '../../dist');
const PORT = Number(process.env.PORT ?? 4173);
// REAL=1: serve the real sign list (dist/data) and the encoded clips instead of the fixtures.
const REAL = process.env.REAL === '1';
// BASE_PATH=/tsl-learn serves the app under a subpath, the way a GitHub Pages project site is served.
const BASE_PATH = (process.env.BASE_PATH ?? '').replace(/\/$/, '');

import { existsSync, readFileSync } from 'node:fs';

// Fixture mode uses small synthetic videos generated for the tests (e2e/fixtures/clips), so playback tests are
// real and run anywhere with no dictionary content. REAL=1 serves the real encoded clips instead.
const realDir = join(root, '../clips-360');
const fixtureDir = join(root, '../e2e/fixtures/clips');
const clipBytes = (video, n, seed) => {
  const p = join(REAL ? realDir : fixtureDir, video);
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

// Drawings for a few fixture signs; the image files themselves are the real ones in dist/pictures.
const pictures = {
  schemaVersion: 1,
  hands: {
    209: { label: '雞', file: 'pictures/hand/209.jpg' },
    101: { label: '一', file: 'pictures/hand/101.jpg' },
    314: { label: '矮' },
    105: { label: '兄', file: 'pictures/custom/hand/105.png', custom: true }, // file does not exist: must fall back to an empty tile
  },
  places: { 602: { label: 'palm', file: 'pictures/place/602.jpg' }, 401: { label: 'in front of body', file: 'pictures/place/401.jpg' } },
  signs: {
    thank_n: { h: [['209', 1, 1]], p: ['602'] },
    thank_s: { h: [['101', 1, 1], ['209', 2, 1]], p: ['602'] },
    welcome_b: { h: [['314', 1, 1]], p: ['401'] },
    thank_b: { h: [['105', 1, 1]] },
  },
};

const state = { notFound: new Set(), swSuffix: '', inflight: 0, peak: 0, clipHits: {}, delayMs: 40 };
const reset = () => {
  state.notFound.clear();
  state.swSuffix = '';
  state.inflight = 0;
  state.peak = 0;
  state.clipHits = {};
  state.delayMs = 40;
};

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let path = decodeURIComponent(url.pathname);
  const send = (code, body, type = 'text/plain') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  if (BASE_PATH) {
    if (path === BASE_PATH) {
      res.writeHead(301, { location: `${BASE_PATH}/` });
      return res.end();
    }
    if (path.startsWith(`${BASE_PATH}/`)) path = path.slice(BASE_PATH.length);
    else if (!path.startsWith('/__')) return send(404, 'outside the base path');
  }

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
  if (!REAL && path === '/data/pictures.json') return send(200, JSON.stringify(pictures), 'application/json');
  if (!REAL && path === '/data/manifest.json') return send(200, JSON.stringify(manifest), 'application/json');

  if (path.startsWith('/clips/')) {
    const video = path.slice('/clips/'.length);
    state.clipHits[video] = (state.clipHits[video] ?? 0) + 1;
    state.peak = Math.max(state.peak, ++state.inflight);
    await new Promise((r) => setTimeout(r, state.delayMs));
    state.inflight--;
    if (REAL) {
      if (state.notFound.has(video)) return send(404, 'nope');
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

// Clip hosts on other origins, to test a separately hosted clip site:
//   CLIPS_PORT        sends Access-Control-Allow-Origin: * (like GitHub Pages)
//   CLIPS_NOCORS_PORT does not (a host that would block the app)
for (const [envName, cors] of [['CLIPS_PORT', true], ['CLIPS_NOCORS_PORT', false]]) {
  const port = Number(process.env[envName] ?? 0);
  if (!port) continue;
  createServer(async (req, res) => {
    const video = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    state.clipHits[video] = (state.clipHits[video] ?? 0) + 1;
    state.peak = Math.max(state.peak, ++state.inflight);
    await new Promise((r) => setTimeout(r, state.delayMs));
    state.inflight--;
    const headers = { 'content-type': 'video/mp4', 'cache-control': 'no-store', ...(cors ? { 'access-control-allow-origin': '*' } : {}) };
    if (state.notFound.has(video) || !FIXTURE_CLIPS[video]) {
      res.writeHead(404, headers);
      return res.end('nope');
    }
    res.writeHead(200, headers);
    res.end(FIXTURE_CLIPS[video]);
  }).listen(port, () => console.log(`clip host (${cors ? 'CORS' : 'no CORS'}) on ${port}`));
}
