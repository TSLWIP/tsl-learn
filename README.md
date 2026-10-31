# TSL Learn

Offline-first study app for Taiwan Sign Language (work in progress, see `DECISIONS.md`).

```
npm run lexicon      # build public/data/lexicon.json + manifest.json from the old project's lexicon
npm test             # unit tests (matching, storage migrations, fetcher, validator)
npx vite build       # production build into dist/
npm run e2e          # Playwright chaos tests (needs dist/; uses a fixture server, no real clips)
bash scripts/encode-clips.sh   # re-encode clips to 360p into clips-360/
```

`legacy/` holds the first version of the app (single HTML files) for reference. Clips are not part of this repo;
see `NOTICE.md`.
