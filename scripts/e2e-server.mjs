// Test server for Playwright: serves dist/ over real HTTP (so the real service worker is in the loop),
// replaces the sign list and clips with a tiny fixture set, and lets tests inject failures.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '../../dist');
const PORT = Number(process.env.PORT ?? 4173);

const clipBytes = (n, seed) => Buffer.alloc(n, seed);
const FIXTURE_CLIPS = {
  'T/thank_a.mp4': clipBytes(1200, 1),
  'T/thank_b.mp4': clipBytes(900, 2),
  'G/good_bye.mp4': clipBytes(1500, 3),
  'O/one.mp4': clipBytes(700, 4),
};
const entry = (id, en, zh, category, video) => ({
  id, chinese: zh, english: en, category, dialect: 'both', video,
  sourceUrl: 'https://twtsl.ccu.edu.tw/', licenseNote: 'fixture',
});
const lexicon = {
  schemaVersion: 1,
  buildId: 'e2e-1',
  categories: [
    { id: 'etiquette', en: 'Etiquette', zh: '禮貌' },
    { id: 'numbers', en: 'Numbers', zh: '數字' },
  ],
  entries: [
    { ...entry('thank_a', ['thank'], '感謝', 'etiquette', 'T/thank_a.mp4'), senseLabel: 'Variant A' },
    { ...entry('thank_b', ['thank'], '感謝', 'etiquette', 'T/thank_b.mp4'), senseLabel: 'Variant B' },
    entry('good_bye', ['goodbye'], '再見', 'etiquette', 'G/good_bye.mp4'),
    entry('one', ['one'], '一', 'numbers', 'O/one.mp4'),
  ],
};
const manifest = {
  buildId: 'e2e-1',
  clips: Object.entries(FIXTURE_CLIPS).map(([video, b]) => ({ video, size: b.length })),
};

const state = { notFound: new Set(), swSuffix: '', inflight: 0, peak: 0, clipHits: {}, delayMs: 40 };
const reset = () => {
  state.notFound.clear();
  state.swSuffix = '';
  state.inflight = 0;
  state.peak = 0;
  state.clipHits = {};
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
    if (url.searchParams.has('swSuffix')) state.swSuffix = url.searchParams.get('swSuffix');
    return send(200, 'ok');
  }
  if (path === '/__stats') return send(200, JSON.stringify({ peak: state.peak, clipHits: state.clipHits }), 'application/json');

  if (path === '/data/lexicon.json') return send(200, JSON.stringify(lexicon), 'application/json');
  if (path === '/data/manifest.json') return send(200, JSON.stringify(manifest), 'application/json');

  if (path.startsWith('/clips/')) {
    const video = path.slice('/clips/'.length);
    state.clipHits[video] = (state.clipHits[video] ?? 0) + 1;
    state.peak = Math.max(state.peak, ++state.inflight);
    await new Promise((r) => setTimeout(r, state.delayMs));
    state.inflight--;
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
