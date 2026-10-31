# Hand-shape and location drawings

Under each sign's clip the app shows the dictionary's drawings of the **hand shape** (手形) and the **location** (位置)
where the sign is made. A sign with two different hand shapes shows both, labelled "hand 1" and "hand 2".

Where they come from: the drawings are the Taiwan Sign Language Online Dictionary's (National Chung Cheng
University), taken from the earlier `E:\TSL` project's local copy (62 hand shapes, 30 locations, shrunk to about
1.7 MB in all). No request was made to the dictionary's server. The same reuse caveat as the clips applies: see
[NOTICE.md](../NOTICE.md).

## What is on disk

| Path | What |
| --- | --- |
| `public/pictures/hand/<number>.jpg` | dictionary hand-shape drawings (generated, 480 px) |
| `public/pictures/place/<number>.jpg` | dictionary location drawings (generated) |
| `public/pictures/custom/hand/<number>.<ext>` | **your replacement drawings** (never touched by the build script) |
| `public/pictures/custom/place/<number>.<ext>` | **your replacement location drawings** |
| `public/data/pictures.json` | which sign uses which drawing (generated) |

Each drawing is identified by the number at the start of its dictionary code: `209_雞` is hand shape **209**
(the chicken-beak shape), `602_palm` is location **602**. Open `public/data/pictures.json` to see every number with
its readable name, or look at a sign in the app: the name is printed under each drawing.

## Replacing a drawing with your own

1. Make a square-ish picture (about 480 x 480 px; PNG, JPG, WEBP or SVG). Keep the background white or transparent:
   the tile behind it is white.
2. Name it after the number: `209.png`.
3. Put it in `public/pictures/custom/hand/` (hand shapes) or `public/pictures/custom/place/` (locations). Create the
   folder if it is not there yet.
4. Run `npm run pictures`. It reads the folder and points `pictures.json` at your file instead of the dictionary's.
5. Run `npm run build`, check it in the browser (`npm run preview`), then commit and push as usual.

Your drawing then appears for **every sign that uses that hand shape or location**, because the drawings are shared.
Delete the file and run `npm run pictures` again to go back to the dictionary's drawing.

If you want to make a drawing for a hand shape the dictionary has no picture for yet, the app already shows an empty
"No drawing yet" tile with the name. `npm run pictures` prints which numbers have none (today: 314 矮 and 321 WC).

## Rebuilding from the source data

`npm run pictures` needs the old project's data (`E:\TSL\data`) and `ffmpeg` on the PATH. Run it again only if the
sign list changes. It rewrites `public/pictures/hand`, `public/pictures/place` and `public/data/pictures.json`.
Anything in `public/pictures/custom/` is kept.

## If a drawing is missing or broken

The sign page does not break: the tile stays in place with the name and "No drawing yet", so the layout does not
move and a replacement can be dropped in later.
