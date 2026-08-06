#!/usr/bin/env bash
# Unify Board + Jobs screening questions on Gina (Mac).
#
# Board Screening gets the same setup as Jobs Edit:
#   Generate questions + Have Maria design full screening
# Questions sync both ways; answers stay with each candidate.
#
# Usage:
#   bash gina-express/frontend/APPLY-UNIFY-SCREENING-QUESTIONS.sh ~/lyday-gina-backend
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
git pull origin cursor/unify-screening-questions-4f1f || \
  git pull origin cursor/ai-ats-b2b-platform-4f1f || \
  git pull || true

GINA_BACKEND="$ROOT"
if [[ -f "$ROOT/gina-backend/server.js" ]]; then
  GINA_BACKEND="$ROOT/gina-backend"
fi

echo "== Patch App.jsx + dist for unified screening =="
node "$AI_ATS/gina-express/frontend/patch-unify-screening-questions.mjs" "$GINA_BACKEND" || true
node "$AI_ATS/gina-express/frontend/patch-unify-screening-questions-dist.mjs" "$GINA_BACKEND"

if [[ -d "$GINA_BACKEND/frontend" ]]; then
  echo "== Rebuild frontend dist =="
  (cd "$GINA_BACKEND/frontend" && npm run build)

  echo "== Re-apply dist patch after Vite rename =="
  node "$AI_ATS/gina-express/frontend/patch-unify-screening-questions-dist.mjs" "$GINA_BACKEND"

  # Safety: still harden jobs questions.length
  node "$AI_ATS/gina-express/frontend/patch-jobs-edit-questions-dist.mjs" "$GINA_BACKEND" || true
fi

# Verify markers in newest dist bundle
BUNDLE="$(ls -t "$GINA_BACKEND"/frontend/dist/assets/index-*.js 2>/dev/null | head -1 || true)"
if [[ -n "$BUNDLE" ]]; then
  echo "== Verify $BUNDLE =="
  for needle in "data-board-maria-screening" "Synced with Jobs" "__ginaSharedScreeningApply" "Have Maria design full screening"; do
    if grep -q "$needle" "$BUNDLE"; then
      echo "OK: $needle"
    else
      echo "MISSING: $needle"
    fi
  done
  if grep -q "Tailor questions to this role" "$BUNDLE"; then
    echo "WARN: old Tailor label still present"
  else
    echo "OK: Tailor label removed"
  fi
fi

echo "== Commit + push Gina =="
cd "$ROOT"
git add \
  gina-backend/frontend/src/App.jsx \
  gina-backend/frontend/dist 2>/dev/null || true
git add -f gina-backend/frontend/dist 2>/dev/null || true
git status
git commit -m "Unify Board + Jobs screening (Generate + Maria, sync both ways)" || true
git pull origin main --rebase || true
git push origin main

echo ""
echo "Done. After Railway redeploy + hard refresh:"
echo "  Jobs → Edit: Generate + Maria Design (unchanged, now syncs to Board)"
echo "  Board → candidate → Screening: same Generate + Maria Design setup"
echo "  Use these questions updates BOTH tabs; answers stay with each candidate"
