#!/usr/bin/env bash
# Unbreak Gina ATS React #31 (object with keys {}).
# Run from anywhere on the Mac:
#   bash ~/AI-ATS/gina-express/frontend/UNBREAK-ATS-REACT31.sh
set -euo pipefail
AI_ATS="${AI_ATS:-$HOME/AI-ATS}"
GINA_DIR="${GINA_DIR:-$HOME/lyday-gina-backend/gina-backend}"

cd "$AI_ATS"
git pull origin cursor/ai-ats-b2b-platform-4f1f

node gina-express/frontend/fix-main-entry.mjs "$GINA_DIR"
node gina-express/frontend/fix-react-31.mjs "$GINA_DIR"
node gina-express/frontend/fix-job-context-crash.mjs "$GINA_DIR"
node gina-express/frontend/fix-assets-auth-block.mjs "$GINA_DIR"
node gina-express/frontend/patch-check-for-actions.mjs "$GINA_DIR"

cd "$GINA_DIR/frontend"
npm run build
NEW_JS="$(ls -1 dist/assets/index-*.js | head -1)"
echo ""
echo "NEW bundle: $NEW_JS"
echo "If this still says index-DVEQEwJq.js, the build did not change — stop and paste git status."
echo ""

cd "$(dirname "$GINA_DIR")"
# dist is often gitignored — Railway serves dist, so force-add is required
git add gina-backend/frontend/src/App.jsx gina-backend/frontend/index.html gina-backend/frontend/src/main.jsx || true
git add -f gina-backend/frontend/dist
git status
echo "Staged dist JS files:"
git diff --cached --name-only | grep 'frontend/dist' || echo "WARNING: dist not staged — Railway will keep the old bundle"
git commit -m "Fix React #31: sanitize Jobs data + deploy dist bundle" || echo "(nothing new to commit — check if dist hash changed)"
git pull origin main --rebase
git push origin main

echo ""
echo "After Railway redeploys:"
echo "  1) Hard refresh (Cmd+Shift+R)"
echo "  2) Confirm JS URL is NOT index-DVEQEwJq.js"
echo "  3) In console: localStorage.clear(); sessionStorage.clear(); location.reload();"
