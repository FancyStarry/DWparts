#!/usr/bin/env bash
# Rebuild the WebP assets in public/img/{common,characters} from the raw PNG
# originals in assets-src/img/raw. The page references only the WebP output;
# the raw files are the source of truth and are never modified by this script.
#
# Usage:
#   tools/build-images.sh            # convert new or changed files only
#   tools/build-images.sh --force    # reconvert everything
#   tools/build-images.sh --prune    # also delete WebP files with no raw source
#
# Requires: cwebp (Debian: apt install webp)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RAW="$ROOT/assets-src/img/raw"
OUT_COMMON="$ROOT/public/img/common"
OUT_CHARS="$ROOT/public/img/characters"

FORCE=0
PRUNE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --prune) PRUNE=1 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//' ; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

command -v cwebp >/dev/null || { echo "cwebp not found; install the webp package" >&2; exit 1; }

converted=0
skipped=0
pruned=0

convert_dir() {
  local src_dir="$1" out_dir="$2" label="$3"
  mkdir -p "$out_dir"
  shopt -s nullglob
  for png in "$src_dir"/*.png; do
    local base out
    base="$(basename "$png" .png)"
    out="$out_dir/$base.webp"
    if [ "$FORCE" -eq 0 ] && [ -f "$out" ] && [ "$out" -nt "$png" ]; then
      skipped=$((skipped + 1))
      continue
    fi
    # Lossless with alpha, maximum compression effort, no metadata.
    # The icons are pixel art; lossy encoding produces visible artefacts.
    cwebp -quiet -lossless -z 9 -metadata none "$png" -o "$out"
    converted=$((converted + 1))
  done
  shopt -u nullglob

  if [ "$PRUNE" -eq 1 ]; then
    for webp in "$out_dir"/*.webp; do
      local base
      base="$(basename "$webp" .webp)"
      if [ ! -f "$src_dir/$base.png" ]; then
        rm -f "$webp"
        echo "pruned $label/$base.webp"
        pruned=$((pruned + 1))
      fi
    done
  fi
}

convert_dir "$RAW/common" "$OUT_COMMON" "common"
convert_dir "$RAW/characters" "$OUT_CHARS" "characters"

echo "converted: $converted  skipped: $skipped  pruned: $pruned"
