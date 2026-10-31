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

## Milestone 3 (lookup, library, player)

- **Matching order:** hand-written alias, then exact primary gloss (longest phrase first, up to the longest phrase in the data), inflections of the last word, "goodbye" -> "good bye" joining, and only then synonyms. Every non-exact route is labelled on the chip ("synonym", "phrase", "joined").
- **Primary glosses beat synonyms.** A word is only matched through a synonym when no sign has it as its primary gloss.
- **Closed-class words never use synonyms** (will, can, to, of, ...): the old project found modal "will" resolving to the noun "volition".
- **Aliases are few and explicit** (`src/match/data.ts`): "thank you" and "thanks" -> thank, "bye" -> good bye, "you are welcome". Everything else is dictionary data.
- **Articles and "be" forms are shown as "not signed"** rather than as missing: the dictionary has no sign for them. This is a statement about the dictionary, not a claim about TSL grammar.
- **Numbers:** only digits and numbers that have their own sign (0-20, tens, hundred, thousand) are looked up; "25" is reported with its single digits offered, not composed, because I could not confirm how TSL builds them.
- **"Did you mean" only for words of 5+ letters** (1 typo; 2 for 9+). Shorter words are usually real words with no sign, and suggestions like nice -> niece were misleading.
- **Related-word suggestions** (`RELATED`): hello/hi -> welcome, shake hands. Shown as "close matches", never used as the answer.
- **Dialect choice:** pinned sign, else the chosen dialect's own sign, else a shared sign, else the other dialect's. All variants stay one tap away and are labelled.
- **Prefs, pins and "missing" flags live in the IndexedDB `meta` store** (and in the backup file); no schema bump needed.
- **A clip the learner opens jumps the download queue** (priority) and is cached on first view; clips are never played from a wrong-size cache entry.
- **Playwright: bundled Chromium for storage chaos tests, installed Chrome for playback** (Chromium has no H.264). `REAL=1 ... --project=real` runs the same flows on the real 5,390 signs and clips (local only).
