#!/usr/bin/env bash
# Apply LIVE Candidate File sync on Gina (Mac).
#
# Bots keep Candidate Files current until Kimberley sends / cancels / deletes.
# Dashboard panel + dual-file Notes/pipeline on every update.
#
# Usage:
#   bash gina-express/frontend/APPLY-LIVE-CANDIDATE-FILE.sh ~/lyday-gina-backend
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
git pull origin cursor/live-candidate-file-4f1f || \
  git pull origin cursor/ai-ats-b2b-platform-4f1f || \
  git pull || true

GINA_BACKEND="$ROOT"
if [[ -f "$ROOT/gina-backend/server.js" ]]; then
  GINA_BACKEND="$ROOT/gina-backend"
fi

echo "== Copy Candidate File live sync kit =="
mkdir -p "$GINA_BACKEND/lib" "$GINA_BACKEND/routes" "$GINA_BACKEND/agents" \
  "$GINA_BACKEND/frontend/public" "$GINA_BACKEND/frontend/src"
cp -f "$AI_ATS/gina-express/lib/candidate-files.js" "$GINA_BACKEND/lib/"
cp -f "$AI_ATS/gina-express/lib/candidate-file-live.js" "$GINA_BACKEND/lib/"
cp -f "$AI_ATS/gina-express/routes/candidate-files.js" "$GINA_BACKEND/routes/"
cp -f "$AI_ATS/gina-express/agents/candidate-file.tool.js" "$GINA_BACKEND/agents/" 2>/dev/null || true
cp -f "$AI_ATS/gina-express/agents/command-agent.tool.js" "$GINA_BACKEND/agents/" 2>/dev/null || true
cp -f "$AI_ATS/gina-express/frontend/candidate-file.html" "$GINA_BACKEND/frontend/public/" 2>/dev/null || true
cp -f "$AI_ATS/gina-express/frontend/candidate-file.html" "$GINA_BACKEND/frontend/" 2>/dev/null || true
cp -f "$AI_ATS/gina-express/frontend/applyAgentAction.replacement.js" "$GINA_BACKEND/" 2>/dev/null || true
cp -f "$AI_ATS/gina-express/CANDIDATE-FILE.md" "$GINA_BACKEND/" 2>/dev/null || true
cp -f "$AI_ATS/gina-express/GINA_TEAM_PROMPT_RULE.txt" "$GINA_BACKEND/" 2>/dev/null || true

# Ensure routes + page mounted
node "$AI_ATS/gina-express/frontend/patch-candidate-files.mjs" "$GINA_BACKEND" || true
node "$AI_ATS/gina-express/frontend/patch-candidate-file-toolbar.mjs" \
  "$GINA_BACKEND/frontend/src/App.jsx" || true
node "$AI_ATS/gina-express/frontend/patch-live-candidate-files-dashboard.mjs" \
  "$GINA_BACKEND/frontend/src/App.jsx" || true

# Refresh Check for actions with CF sync hooks
if [[ -f "$GINA_BACKEND/frontend/src/App.jsx" ]]; then
  node "$AI_ATS/gina-express/frontend/patch-check-for-actions.mjs" "$GINA_BACKEND" || true
fi

if [[ -d "$GINA_BACKEND/frontend" ]]; then
  echo "== Rebuild frontend dist =="
  (cd "$GINA_BACKEND/frontend" && npm run build) || true
fi

echo "== Commit + push Gina =="
cd "$ROOT"
git add \
  gina-backend/lib/candidate-files.js \
  gina-backend/lib/candidate-file-live.js \
  gina-backend/routes/candidate-files.js \
  gina-backend/agents \
  gina-backend/frontend/src/App.jsx \
  gina-backend/frontend/public/candidate-file.html \
  gina-backend/frontend/candidate-file.html \
  gina-backend/CANDIDATE-FILE.md \
  gina-backend/GINA_TEAM_PROMPT_RULE.txt \
  gina-backend/server.js 2>/dev/null || true
git add -f gina-backend/frontend/dist 2>/dev/null || true
git add -A gina-backend/lib gina-backend/routes/candidate-files.js 2>/dev/null || true

git status
git commit -m "Live Candidate File: bots auto-update until send/cancel; dashboard + Notes" || true
git pull origin main --rebase || true
git push origin main

echo ""
echo "Done. After Railway redeploy:"
echo "  • Dashboard shows Live Candidate Files"
echo "  • Open /candidate-file?id=<id> anytime"
echo "  • Maria/Michelle/Kelley/Ashton updates sync the file + Kimberley Notes + pipeline"
echo "  • Send to client freezes; Cancel/Delete closes"
