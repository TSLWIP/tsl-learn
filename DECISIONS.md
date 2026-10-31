# Decisions

- **New repo at `E:\TSL-Learn`, old files copied to `legacy/`** (fetched from GitHub; the old Electron project in `E:\TSL` is only a data source).
- **Preact + Vite + TypeScript**, no runtime CDN. Chosen for many interactive screens and per-screen error boundaries.
- **Clips are cached as Blobs in IndexedDB and played via object URLs**, not through the service worker. The worker stays out of video range requests, which are fragile on iOS.
- **Service worker is hand-written** (no Workbox): a build hash names the shell cache, install does not skip waiting, the page asks to update, and activate deletes every other cache.
- **Sign list and manifest are fetched network-first, with a second copy in IndexedDB**, so wiping the Cache API cannot leave the app without data.
- **Offline pack repair covers only clips the user chose to keep** (`wantedClips`), never the whole library. Repairs run through a polite fetcher: 2 at a time, 250 ms apart, backoff on 429/5xx, stops after 8 failures in a row.
- **Schema 2 is the first real schema**; "v1" exists only as a fixture shape to prove migrations (`tests/storage.test.ts`, chaos spec).
- **Newer-than-app data is never overwritten**: the app shows a message instead of downgrading the database.
- **Clips re-encoded to 360p H.264, CRF 28, no audio** (about 8% of original size). The frame comparison showed no visible loss in hand shape. Originals are untouched.
- **Topical categories come from the old project's 13 hand-curated lists** (about 180 signs); everything else is "More signs" until a better categorisation exists. The old part-of-speech `category` is dropped.
- **Free variants and same-gloss signs get a `senseLabel`** (variant letter, else the first words of the description) so the validator can require every duplicate English word to be distinguishable.
- **`sourceUrl` is the dictionary home page** because the source data has no per-sign URL.
- **Streaming from CCU is not wired up yet**: the clip URL scheme on twtsl.ccu.edu.tw is not known. `public/content-source.json` points at local `clips/` for now.
