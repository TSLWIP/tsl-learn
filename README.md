# TSL Learn

An offline-first study app for **Taiwan Sign Language** (臺灣手語). Look signs up in English or Chinese, browse a
5,000-sign library, and practise with spaced-repetition quizzes. It runs entirely in the browser: no accounts, no
backend, no analytics. Installable on an iPhone, Android phone or desktop as an app.

Sign clips and glosses come from the [TSL Online Dictionary](https://twtsl.ccu.edu.tw/) of National Chung Cheng
University. This is an unofficial study tool; see [NOTICE.md](NOTICE.md) and [Content and licensing](#content-and-licensing).

## What it does, and what it deliberately does not

- **Sign lookup.** Type words or a phrase and get the dictionary sign for each, in the order typed, with the
  Chinese gloss next to the English. **This is a gloss lookup, not a translation**: TSL has its own word order and
  uses the face, head and body as grammar. The app says so on screen.
- **It never guesses.** A word with no sign gets "No sign found", close matches and a "flag as missing" button. There is
  no generic fallback sign. (The dictionary has no sign for "hello", for example.)
- **Dialects and variants.** Where a word has northern (Taipei) and southern (Tainan) signs or free variants, all are
  shown and labelled. Choose a preferred dialect, and pin a preferred sign per word.
- **Learning.** SM-2 spaced repetition; five quiz styles (sign to meaning, meaning to sign, typed, matching,
  flashcards) plus a mixed mode; distractors drawn from the same topic and from signs you have confused before; a
  mistake-review pass at the end; your own decks; a daily new-sign cap.
- **Progress.** Daily goal, a forgiving practice streak (one missed day does not break it), weekly activity, mastery
  and per-topic completion.
- **Offline.** Clips you watch are saved on the device, and you can save whole topics ahead of time.

## Quick start

Requires Node 24.

```bash
npm ci
npm run dev        # http://localhost:5173 (needs data and clips, see below)
```

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests: matching, scheduler, quiz logic, storage migrations, fetcher, contrast, stats |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run check-dist` | Release guards on `dist/`: relative URLs only, no CDN, stamped service worker, no clips |
| `npm run e2e` | Browser tests: storage chaos, lookup, learning, onboarding/progress/backup, accessibility (axe) |
| `npm run soak` | Weeks of simulated use on the built copy, served under a subpath like GitHub Pages |
| `REAL=1 SOAK_DAYS=30 npm run soak` | The same, on the real dictionary and clips (local only; in PowerShell set `$env:REAL=1; $env:SOAK_DAYS=30` first) |
| `npm run lexicon` | Rebuild `public/data/lexicon.json` and `manifest.json` (needs the source data, see below) |
| `bash scripts/encode-clips.sh` | Re-encode clips to 360p H.264 into `clips-360/` |

The browser tests use a tiny fixture server (`scripts/e2e-server.mjs`) that replaces the sign list and clips, so
they run anywhere. The lookup, learning and soak tests need real H.264 playback, so they run in installed Chrome.

## Data and clips

- `public/data/lexicon.json`: the sign list (id, Chinese, English and synonyms, topic, dialect, variant label,
  description, clip path, source, licence note). Built by `scripts/build-lexicon.ts`, whose validator **fails the
  build** on a missing clip, a duplicate id, an entry with no gloss, or an English word that maps to several signs
  with no dialect or variant label.
- `public/data/manifest.json`: every clip with its size, used to detect missing or damaged clips on the device.
- **Clips are not in this repository.** They are fetched from the *content source*, set in
  `public/content-source.json` (or at deploy time, see below). The app works the same whether clips are on your own
  host, a folder served next to the app, or anywhere else that serves the same file names.
- The source data came from an earlier project's compiled dictionary. Clips were re-encoded to 360p H.264 with no
  audio (about 265 MB for all 5,390 clips instead of 3.3 GB); the comparison showed no visible loss in hand shape.

## Content and licensing

The dictionary states no reuse terms, and none were found elsewhere, so **re-hosting its clips is not clearly
allowed**. This project therefore ships the app without clips and keeps the content source separate from the code.
Do not publish clips you do not have permission for. The lowest-risk route is to ask the Institute of Linguistics at
National Chung Cheng University for written permission.

Technical note on streaming straight from the dictionary: its clip files (for example
`https://twtsl.ccu.edu.tw/video/m/ma.mp4`) are public but sent **without CORS headers**, so a page on another site
can play them in a `<video>` tag but cannot download them to save for offline use. A static site cannot cache them.

When fetching from any third-party server the app is deliberately gentle: at most 2 requests at once, 250 ms apart,
backoff on 429/5xx (honouring `Retry-After`), no retry on 404, and it stops after 8 failures in a row.

## Deploying to GitHub Pages

1. Put the project in a GitHub repository whose default branch is `main`, and in **Settings → Pages** choose
   **Source: GitHub Actions**.
2. Push. [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the typecheck, unit tests, build, release
   guards, all browser tests and a soak test, and deploys `dist/` only if everything passes.
3. To serve clips from your own host, set the repository variable **`CLIP_BASE_URL`** (an `https://` URL ending in
   `/`, serving files such as `A/able_n.mp4`). No code change is needed.

The build uses relative URLs throughout, so it works at `https://<user>.github.io/<repo>/`; this is checked by
`npm run check-dist` and by serving the build under a subpath in the soak test.

## Using it on a phone

- **iPhone:** open the site in Safari, tap Share, then **Add to Home Screen**.
- **Android / desktop Chrome or Edge:** use the browser's *Install app* option.
- Browsers can clear a site's data after long disuse or when storage is tight. The app asks the browser to keep its
  data (Settings → Storage shows whether that was granted), keeps a second copy of the sign list, repairs missing
  clips on launch, and reminds you gently to save a **backup file** (Settings → Backup). Restoring a backup merges
  into whatever is already there and never deletes anything.

## Why this version should keep working

The first version stopped working after weeks or months. Reading its code showed no service worker, clips stored only
as large IndexedDB blobs filled by a manual folder import (nothing to fall back on if the browser evicted them),
unversioned saved data, and object URLs that were never released. This version:

| Risk | What the app does |
| --- | --- |
| Stale or mismatched cached files | Service worker with a per-build cache name; "new version, reload" prompt; old caches deleted on activate |
| Browser clears storage | Persistence requested; sign list kept in two places; clips re-downloaded on launch if missing or damaged; backup and restore |
| Saved-data format changes | Every record carries a schema version; migrations are tested from a fake v1 store; newer data is never overwritten |
| Clips from a host that changes | One content-source setting; clips checked against a manifest; a missing clip shows an error, never a wrong sign |
| CDN scripts vanishing | Nothing is loaded from a CDN; checked in `check-dist` |
| One bug taking down the app | Per-screen error boundaries and a local error log (Settings → Error log, with a copy button) |
| Memory growth in long sessions | Clip object URLs are released; the soak test counts them every simulated day |

## Project layout

```
src/lexicon   schema and the build-time validator
src/match     normalisation, phrase/inflection/synonym matching, typeahead, library search
src/srs       the SM-2 scheduler
src/quiz      question building, distractors, typed-answer checking
src/progress  streak, weekly activity, mastery, backup-reminder rules
src/storage   IndexedDB layer, migrations, backup/restore
src/clips     polite fetcher, offline packs, clip loading
src/boot      self-healing startup
src/ui        screens (Preact)
public/sw.js  the service worker (stamped with a build hash at build time)
scripts       lexicon build, clip encoding, icons, test server
e2e           Playwright tests (chaos, lookup, learning, accessibility, soak)
legacy/       the first version, kept for reference
DECISIONS.md  every judgment call, with the reason
```

## Known limits

- Real-device behaviour (iOS Safari, home-screen storage eviction) has not been tested; the automated checks run in
  desktop Chrome and Chromium.
- Only about 180 signs have topical categories (from a hand-made list); the rest are under "More signs", which also
  makes their quiz distractors easier.
- No non-manual markers, agreement-verb direction or real TSL grammar: the clips are citation forms.
- Numbers without a sign of their own (like 25) are reported, not composed.
