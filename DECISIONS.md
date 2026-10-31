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

## Milestone 4 (learning core)

- **Scheduler is plain SM-2 with four grades** (`src/srs/sm2.ts`): good = 1 day, 6 days, then interval x ease; "again" = retry in 10 minutes and ease -0.2 (floor 1.3); hard x1.2, ease -0.15; easy x ease x1.3, ease +0.15. Pure and deterministic; the clock is passed in.
- **Quiz answers become grades:** correct = good, correct with a typo = hard, wrong = again. Only the first attempt on a sign in a session is recorded; the end-of-session mistake review is deliberately ungraded.
- **Mistake review:** every missed sign is asked once more as a recognition question at the end, and does not touch the schedule.
- **New signs are met before they are asked:** "Learn new" shows each sign as an ungraded intro card (watch, reveal meaning), then asks it as sign-to-meaning. A sign enters the schedule on its first graded answer, which also sets `introducedAt` for the daily cap (default 5/day, 1-30, adjustable).
- **One unit per word:** variants collapse to the sign for the learner's dialect or pinned choice, so a dialect pair is learned once. Custom decks hold the exact signs the learner added.
- **Distractors, in priority order:** signs mistaken for this one before (`confusions`, up to 6 per sign), the same topical category, a shared Chinese character, anything. Never a variant of the answer, never two options with the same text, never two different signs with the same primary English word.
- **Question text alternates English and Chinese by default** (setting: mixed / English / 中文). Chinese is only used when every option has Chinese.
- **Typed answers accept** any English gloss or synonym of the sign or its variants, the Chinese gloss, plural/-ing forms; one slip in a word of 5+ letters is "close enough" (graded hard), two for 9+. Other signs' words never match.
- **Mixed mode rotates** sign-to-meaning, meaning-to-sign, typed, flashcard. Matching is its own mode: four clips against four words; sets of fewer than four are padded with ungraded extras.
- **Quiz DOM carries `data-correct` / `data-answer`** so end-to-end tests can answer without reading the video. It is not secret information and screen readers ignore it.
- **Sound is off and haptics on by default**; both are one-tap settings. Haptics do nothing on iOS Safari (no Vibration API).
- **The clip in a quiz is capped at 46% of window height** so the answers are always on screen.

## Milestone 5 (polish)

- **Onboarding is a full-screen, three-step flow that gates the app until finished** (what it is; the honest note that TSL is its own language and Lookup is not translation; dialect and daily goal). Focus moves to each heading. If storage is wiped it shows again, which is honest: the settings really are gone.
- **Daily goal = answers per day** (10/20/40 presets, 5-200 in Settings). It only feeds the progress bar; it never blocks anything. "New signs per day" stays a separate setting.
- **Streak rule (kind by design, unit-tested):** today unfinished is never a miss; one missed day inside a run does not break it; two missed days in a row start a new run, shown as "A fresh start", never as a loss.
- **Mastery levels:** new / learning (reps 0 or interval under 6 days) / getting familiar (6-20 days) / well known (21+). The mastery bar counts each starter-topic word once.
- **Charts follow the dataviz guidance:** one hue; the ordered mastery scale is a single-hue light-to-dark ramp with gaps between segments; every mark colour is tested at 3:1 against the card in both themes; every chart has a text equivalent (legend list, hidden data table) and direct count labels, so nothing relies on colour alone.
- **Backup reminder is a quiet card, never a popup:** shown on Learn and Progress only once there are 50+ answers, no backup in 30 days, and not dismissed ("Later") in the last 14 days.
- **Import merges and never removes**; settings from a backup only fill gaps on a device that has none. Wrong files get a plain explanation and change nothing.
- **Offline packs are per category, with a progress bar, Stop, "Download rest" and Remove.** Anything over 50 MB asks first. The big "More signs" pack is about 245 MB.
- **Theme: auto / light / dark.** Colour tokens are tested for WCAG AA text contrast (4.5:1) in both themes; the two dark blocks are checked to be identical.
- **Reduced motion:** animations stop, and the main clip starts paused with a play button. The small answer tiles in quizzes still loop because the clip is the content there.
- **Accessibility:** skip link, focus moved to the new content on every tab change plus a page title per tab, visible focus rings, `aria-pressed` buttons instead of fake radios, the lookup box is a proper combobox, quiz and library detail have a (hidden) top heading, checkboxes sit in 44 px labels. An automated axe audit (WCAG 2.2 AA plus best practice) runs on every screen and quiz state, in light and dark, with fixtures and with the real 5,390-sign dictionary.
- **Icons are the character 手 on terracotta, generated by `scripts/make-icons.mjs`** (192, 512, maskable and Apple touch). Fonts are the system stack (no web fonts): good Traditional Chinese rendering without a CDN or a large bundled font.
- **The `frontend-design` skill was not available in this environment**, so the visual design (warm paper background, terracotta accent, rounded cards, 手 mark) is my own.
