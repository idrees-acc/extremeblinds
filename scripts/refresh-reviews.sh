#!/bin/bash
# Weekly JustDial review refresh, run by launchd on a Mac (see scripts/in.extremeblinds.reviews.plist).
# JustDial blocks cloud servers, so this has to run from a home connection.
# launchd jobs cannot read ~/Documents, so it runs from its own clone in ~/extremeblinds-reviews.
set -euo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
cd "$(dirname "$0")/.."

echo "== $(date)"
git pull --rebase --quiet
[ -d node_modules ] || npm ci --silent
CHROME_CHANNEL=chrome node scripts/fetch-reviews.mjs
if git diff --quiet -- index.html data/reviews.json; then
  echo "No review changes"
  exit 0
fi
git commit --quiet -m "Update JustDial reviews" -- index.html data/reviews.json
git push --quiet
echo "Pushed updated reviews"
