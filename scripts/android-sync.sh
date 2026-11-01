#!/usr/bin/env bash
# Copies the built game (dist/) into the Android app's assets. Run `npm run build` first.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f dist/index.html ]; then
  echo "dist/index.html not found: run 'npm run build' first." >&2
  exit 1
fi
dest=android/app/src/main/assets/www
rm -rf "$dest"
mkdir -p "$dest"
cp -R dist/. "$dest"/
echo "Copied dist/ to $dest ($(du -sh "$dest" | cut -f1)). Now open android/ in Android Studio and press Run."
