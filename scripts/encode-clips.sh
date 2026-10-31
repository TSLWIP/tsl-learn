#!/bin/bash
# Re-encodes every clip in public/data/lexicon.json to 360p H.264 (CRF 28, no audio, fast-start).
# Originals are never touched. Skips clips already encoded, so it can be stopped and resumed.
# usage: bash scripts/encode-clips.sh [source-dir] [out-dir] [parallel-jobs]
SRC=${1:-/e/TSL/data/source/videos}
OUT=${2:-/e/TSL-Learn/clips-360}
JOBS=${3:-6}
export SRC OUT
mkdir -p "$OUT"
node -e "for (const e of JSON.parse(require('fs').readFileSync('public/data/lexicon.json','utf8')).entries) console.log(e.video)" |
  xargs -d '\n' -P "$JOBS" -n1 bash -c '
    f="$1"; dst="$OUT/$f"
    [ -s "$dst" ] && exit 0
    mkdir -p "$(dirname "$dst")"
    # Git Bash does not translate /e/... paths that contain an apostrophe, so use a relative
    # input path and a cygpath-converted output path.
    out_win=$(cygpath -m "$dst.tmp.mp4")
    ( cd "$SRC" && ffmpeg -v error -y -i "$f" -vf scale=-2:360 -c:v libx264 -crf 28 -preset slow \
        -pix_fmt yuv420p -an -movflags +faststart "$out_win" ) \
      && mv "$dst.tmp.mp4" "$dst" || { echo "FAILED $f"; rm -f "$dst.tmp.mp4"; }
  ' _
echo "done: $(find "$OUT" -name '*.mp4' | wc -l) clips, $(du -sh "$OUT" | cut -f1)"
