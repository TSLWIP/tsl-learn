#!/bin/bash
# Size test: re-encode N sample clips at a few settings and report totals.
SRC=/e/TSL/data/source/videos
OUT=/e/TSL-Learn/.scratch/enc
FILES=$(ls $SRC/A/*.mp4 $SRC/M/*.mp4 $SRC/T/*.mp4 2>/dev/null | awk 'NR%40==1' | head -20)
for cfg in "480 28" "360 28" "360 32"; do
  set -- $cfg; H=$1; CRF=$2
  total_in=0; total_out=0
  mkdir -p $OUT/h${H}_crf${CRF}
  for f in $FILES; do
    b=$(basename $f)
    ffmpeg -v error -y -i "$f" -vf "scale=-2:$H" -c:v libx264 -crf $CRF -preset slow -pix_fmt yuv420p -an -movflags +faststart "$OUT/h${H}_crf${CRF}/$b" || continue
    total_in=$((total_in + $(stat -c %s "$f"))); total_out=$((total_out + $(stat -c %s "$OUT/h${H}_crf${CRF}/$b")))
  done
  echo "h=$H crf=$CRF in=$total_in out=$total_out ratio=$(echo "scale=3; $total_out/$total_in" | bc)"
done
