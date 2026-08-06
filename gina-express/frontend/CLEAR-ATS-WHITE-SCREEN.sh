#!/usr/bin/env bash
# One-shot: clear Gina ATS white screen (bare Board, no Notes/Education UI patches).
# Run on your Mac:
#   bash ~/AI-ATS/gina-express/frontend/CLEAR-ATS-WHITE-SCREEN.sh
set -euo pipefail

AI_ATS="${AI_ATS:-$HOME/AI-ATS}"
GINA_ROOT="${GINA_ROOT:-$HOME/lyday-gina-backend}"
GINA_DIR="$GINA_ROOT/gina-backend"

echo "== pull AI-ATS =="
cd "$AI_ATS"
git fetch origin cursor/ai-ats-b2b-platform-4f1f
git checkout cursor/ai-ats-b2b-platform-4f1f
git pull origin cursor/ai-ats-b2b-platform-4f1f

echo "== emergency git restore App.jsx (Notes-free preferred) =="
node gina-express/frontend/emergency-git-restore-app-jsx.mjs "$GINA_ROOT"

echo "== bare white-screen strip + error banner =="
node gina-express/frontend/fix-ats-white-screen.mjs "$GINA_DIR"

echo "== build frontend dist =="
cd "$GINA_DIR/frontend"
npm install
npm run build

test -f dist/index.html || { echo "ERROR: dist/index.html missing after build"; exit 2; }
echo "dist/index.html ok ($(wc -c < dist/index.html) bytes)"

echo "== commit + push Gina =="
cd "$GINA_ROOT"
git add gina-backend/frontend/src/App.jsx \
        gina-backend/frontend/src/main.jsx \
        gina-backend/frontend/index.html \
        gina-backend/frontend/dist || true
git add -u gina-backend/frontend/dist || true
git status
git commit -m "Clear ATS white screen: Notes-free App.jsx + runtime error banner" || {
  echo "Nothing to commit (working tree clean?) — continuing to push check"
}
git pull origin main --rebase
git push origin main

echo ""
echo "DONE. Now:"
echo "  1) Railway → open Gina service → Redeploy"
echo "  2) Wait until deploy is SUCCESS"
echo "  3) Hard-refresh ATS (Cmd+Shift+R)"
echo "  4) If still broken you should see RED error text — paste it to Cursor"
echo "  5) Do NOT re-run Education / Board From / Kimberley Notes patches yet"
