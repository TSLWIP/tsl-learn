# TSL Learn

Offline-first study app for Taiwan Sign Language (work in progress, see `DECISIONS.md`).

```
npm run lexicon      # build public/data/lexicon.json + manifest.json from the old project's lexicon
npm test             # unit tests (matching, storage migrations, fetcher, validator)
npx vite build       # production build into dist/
npm run e2e          # Playwright: chaos, lookup, learning, accessibility (needs dist/; fixture server, no real clips)
REAL=1 npx playwright test --project=real   # same flows on the real dictionary + clips-360/ (local only)
node scripts/make-icons.mjs    # regenerate the app icons
bash scripts/encode-clips.sh   # re-encode clips to 360p into clips-360/
```

`legacy/` holds the first version of the app (single HTML files) for reference. Clips are not part of this repo;
see `NOTICE.md`.
