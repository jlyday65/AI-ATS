#!/usr/bin/env bash
# Candidate File JD → Jobs Edit + Board Screening job description fields.
#
# Usage:
#   bash gina-express/frontend/APPLY-CF-JD-TO-JOBS-BOARD.sh ~/lyday-gina-backend
#
set -euo pipefail

ROOT="${1:-$HOME/lyday-gina-backend}"
ROOT="${ROOT/#\~/$HOME}"
AI_ATS="$(cd "$(dirname "$0")/../.." && pwd)"

if [[ ! -d "$ROOT" ]]; then
  echo "Gina repo not found: $ROOT"
  exit 1
fi

echo "== Pull AI-ATS kit =="
cd "$AI_ATS"
git pull origin cursor/cf-jd-to-jobs-board-4f1f || \
  git pull origin cursor/ai-ats-b2b-platform-4f1f || \
  git pull || true

GINA_BACKEND="$ROOT"
if [[ -f "$ROOT/gina-backend/server.js" ]]; then
  GINA_BACKEND="$ROOT/gina-backend"
fi

echo "== Re-inject applyAgentAction (JD sync helpers) =="
node "$AI_ATS/gina-express/frontend/patch-check-for-actions.mjs" "$GINA_BACKEND" || \
  node "$AI_ATS/gina-express/frontend/patch-check-for-actions.mjs" "$GINA_BACKEND/frontend/src/App.jsx" || true

FRONTEND="$GINA_BACKEND/frontend"
if [[ ! -f "$FRONTEND/package.json" ]]; then
  echo "No frontend/package.json under $GINA_BACKEND"
  exit 1
fi

echo "== Build frontend dist =="
cd "$FRONTEND"
npm run build

echo "== Dist patches: JD → Board Screening + Jobs questions harden =="
node "$AI_ATS/gina-express/frontend/patch-cf-jd-to-screening-dist.mjs" "$GINA_BACKEND"
node "$AI_ATS/gina-express/frontend/patch-unify-screening-questions-dist.mjs" "$GINA_BACKEND" || true
node "$AI_ATS/gina-express/frontend/patch-jobs-edit-questions-dist.mjs" "$GINA_BACKEND" || true

BUNDLE="$(ls -t dist/assets/index-*.js 2>/dev/null | head -1 || true)"
if [[ -n "$BUNDLE" ]]; then
  echo "== Verify $BUNDLE =="
  if rg -n "syncJobDescriptionEverywhere|__ginaSeedBoardJd|jobDescription\|\|" "$BUNDLE" >/dev/null 2>&1; then
    echo "OK: JD sync markers present"
  else
    echo "WARN: expected JD sync markers not found — check applyAgentAction inject"
  fi
fi

echo "== Commit + push Gina =="
cd "$ROOT"
git add -A gina-backend/frontend/src/App.jsx 2>/dev/null || true
git add -f gina-backend/frontend/dist 2>/dev/null || true
git status
git commit -m "Candidate File JD populates Jobs Edit + Board Screening descriptions" || true
git pull origin main --rebase || true
git push origin main

echo ""
echo "Done. After Railway redeploy + hard refresh:"
echo "  1) Ask Gina to create a Candidate File with full JD → Check for actions"
echo "  2) Jobs → Edit that role → Job description should show the full JD"
echo "  3) Board → candidate → Screening → Job description should show the same JD"
