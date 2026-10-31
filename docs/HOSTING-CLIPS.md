# Hosting the clips

The app does not contain clips. It downloads them from a **clip host**: any static web host that serves the files at
`<base>/<letter>/<name>.mp4` (for example `<base>/A/able_n.mp4`) with the header `Access-Control-Allow-Origin: *`
(GitHub Pages, Cloudflare Pages and Netlify do this by default).

## What the host must serve

- The 5,390 files listed in `public/data/manifest.json`, **byte for byte** (each clip's size is checked; a different
  size is treated as damaged and downloaded again, then reported).
- Exact upper/lower case in paths (the folder is an upper-case letter).
- HTTPS, if the app itself is on HTTPS.

`node scripts/prepare-clips-site.mjs` builds a correct folder from `clips-360/` and refuses to write anything unless every
file matches the manifest exactly (size and letter case). `--check-only` only verifies.

## Pointing the app at a host

- **Deployed site:** set the repository variable `CLIP_BASE_URL` (see [PUBLISHING.md](PUBLISHING.md)). The workflow
  writes it into `content-source.json`; no code change.
- **Local development:** edit `public/content-source.json` (`"baseUrl": "https://example.org/tsl-clips/"`), or leave it as
  `clips/` and put a folder of clips at `public/clips/` (git-ignored).
- **Check it:** Settings → Offline packs → **Test the clip source**. It downloads one clip and explains any failure:
  wrong folder layout, host offline, missing CORS header, or files that differ from the sign list.

## Being kind to the host

The app downloads at most 2 clips at once, 250 ms apart, backs off on 429 and 5xx (and honours `Retry-After`), never
retries a 404, and stops after 8 failures in a row. A learner fetches a clip once and keeps it. Change the limits in
`content-source.json` (`maxConcurrent` 1-4, `minGapMs` 100 or more).

## If the clips change

Re-encode or replace clips, run `npm run lexicon -- --clips clips-360` to refresh `manifest.json` (it also validates the
sign list), commit, redeploy the app, and upload the new clips. Devices notice the new manifest, treat old copies as
damaged, and re-download only what changed.

## Why not stream straight from the dictionary?

Its clip files (for example `https://twtsl.ccu.edu.tw/video/m/ma.mp4`) are public but sent without CORS headers, so
a page on another site can play them in a `<video>` tag but cannot download them for offline use. That would also put every
view on the university's server. If hot-linking is ever wanted, 5,318 of the 5,390 signs have a known clip path in the
earlier project's `enrichment.json`.
