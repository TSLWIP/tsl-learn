# Publishing, step by step

Two GitHub repositories, both public (GitHub Pages on a free account needs a public repo):

- **`tsl-clips`**: the 5,390 re-encoded clips (265 MB), served by GitHub Pages.
- **`tsl-learn`**: the app, built and deployed by the workflow in `.github/workflows/ci.yml`.

Replace `YOU` with your GitHub user name. Do the clips first, so the app has somewhere to point.

> **Before you push anything.** The clips come from the Taiwan Sign Language Online Dictionary, which states no reuse
> terms. Publish them only if you have permission from National Chung Cheng University. The app repository contains
> no clips, but it does contain the dictionary's glosses and sign descriptions as text (`public/data/lexicon.json`).

## 0. Check what will be public

- **Your git identity** is in every commit. See it with:
  ```powershell
  git -C E:\TSL-Learn log --format="%an <%ae>" | Sort-Object -Unique
  ```
  To use a different name or email for future commits, run `git config user.name "..."` and `git config user.email "..."`
  inside the repository. To change the existing commits, ask me and I will rewrite them before the first push.
- Nothing in the repository contains passwords, tokens or personal paths beyond default build-script paths such as
  `E:/TSL/...`.

## 1. Publish the clips

1. On GitHub: **New repository** named `tsl-clips`, Public, **no** README, no .gitignore, no licence.
2. Push the prepared folder (it is outside the app repo, at `E:\TSL-Learn-clips`):
   ```powershell
   cd E:\TSL-Learn-clips
   git init -b main
   git add -A
   git commit -m "Sign clips"
   git remote add origin https://github.com/YOU/tsl-clips.git
   git push -u origin main
   ```
   It is about 5,400 files and 265 MB, so allow several minutes. If the push fails with a timeout or HTTP 408, run
   `git config http.postBuffer 524288000` and push again.
3. In that repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)`
   → Save.** After a minute the site is at `https://YOU.github.io/tsl-clips/`.
4. Check it: open `https://YOU.github.io/tsl-clips/A/able_n.mp4`. It should play. (Folder letters are upper case,
   and GitHub Pages is case-sensitive.)

## 2. Publish the app

1. On GitHub: **New repository** named `tsl-learn`, Public, no README.
2. Push:
   ```powershell
   cd E:\TSL-Learn
   git remote add origin https://github.com/YOU/tsl-learn.git
   git push -u origin main
   ```
   The first push starts the workflow. If you have not finished steps 3 and 4 yet it will deploy a site whose
   clips are missing, which is harmless: run the workflow again afterwards (step 5).
3. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
4. **Settings → Secrets and variables → Actions → Variables tab → New repository variable:**
   name `CLIP_BASE_URL`, value `https://YOU.github.io/tsl-clips/` (https, and it must end with `/`).
5. **Actions → "CI and deploy" → Run workflow** (or push any commit). It runs the typecheck, unit tests, build, release
   guards, all browser tests and a soak test, and deploys only if everything passes. The site is then at
   `https://YOU.github.io/tsl-learn/`.

## 3. Check the live site

1. Open the site, go through the onboarding, then **Settings → Offline packs → Test the clip source**. It should say
   "The clip source works". If not, the message names the likely cause (wrong folder, host offline, missing CORS).
2. Then follow [DEVICE-CHECK.md](DEVICE-CHECK.md) on your iPhone.

## If something goes wrong

- **The workflow fails in the browser tests:** open the run, download the `playwright-traces` artifact (kept 7 days) and
  send it to me. This is the first time the workflow runs on GitHub, so a small environment fix is plausible.
- **The site loads but clips show "could not be loaded":** run "Test the clip source". Most likely `CLIP_BASE_URL` is
  missing or lacks the trailing `/`, or Pages for the clips repo is not switched on yet.
- **A 404 on the app page:** Pages source must be "GitHub Actions", and the workflow must have run on `main`.
- **To take the clips down:** delete the `tsl-clips` repository. The app keeps working for everything already saved on
  a device, and shows a clear message for the rest.
