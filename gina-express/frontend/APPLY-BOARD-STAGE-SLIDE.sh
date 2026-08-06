#!/usr/bin/env bash
# Apply Board stage-slide fixes on Gina (Mac).
#
# Candidates slide under New / Screening / Interview / Offer / Hired / Rejected.
# Kelley reject/advance commands actually move Board cards (not Notes-only).
# Stage aliases ("Rejected", "Phone Screen", "interviewing") normalize to keys.
#
# Usage:
#   bash gina-express/frontend/APPLY-BOARD-STAGE-SLIDE.sh ~/lyday-gina-backend
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
git pull origin cursor/board-stage-slide-4f1f || \
  git pull origin cursor/ai-ats-b2b-platform-4f1f || \
  git pull || true

GINA_BACKEND="$ROOT"
if [[ -f "$ROOT/gina-backend/server.js" ]]; then
  GINA_BACKEND="$ROOT/gina-backend"
fi

echo "== Copy Board stage kit =="
mkdir -p "$GINA_BACKEND/lib" "$GINA_BACKEND/agents" "$GINA_BACKEND/routes" \
  "$GINA_BACKEND/frontend/src"
cp -f "$AI_ATS/gina-express/lib/board-stage.js" "$GINA_BACKEND/lib/"
cp -f "$AI_ATS/gina-express/lib/live-stage-counts.js" "$GINA_BACKEND/lib/"
cp -f "$AI_ATS/gina-express/agents/command-agent.tool.js" "$GINA_BACKEND/agents/"
cp -f "$AI_ATS/gina-express/agents/bot-replies.js" "$GINA_BACKEND/agents/"
cp -f "$AI_ATS/gina-express/routes/run-command.js" "$GINA_BACKEND/routes/"
cp -f "$AI_ATS/gina-express/frontend/applyAgentAction.replacement.js" "$GINA_BACKEND/" 2>/dev/null || true
cp -f "$AI_ATS/gina-express/GINA_TEAM_PROMPT_RULE.txt" "$GINA_BACKEND/" 2>/dev/null || true

echo "== Patch App.jsx Board columns + Check for actions =="
node "$AI_ATS/gina-express/frontend/patch-board-stage-columns.mjs" "$ROOT" || true
if [[ -f "$GINA_BACKEND/frontend/src/App.jsx" ]]; then
  # Injects applyAgentAction.replacement.js (stage normalize + Kelley boardActions)
  node "$AI_ATS/gina-express/frontend/patch-check-for-actions.mjs" "$GINA_BACKEND" || true
fi

if [[ -d "$GINA_BACKEND/frontend" ]]; then
  echo "== Rebuild frontend dist =="
  (cd "$GINA_BACKEND/frontend" && npm run build) || true
fi

echo "== Commit + push Gina =="
cd "$ROOT"
git add \
  gina-backend/lib/board-stage.js \
  gina-backend/lib/live-stage-counts.js \
  gina-backend/agents/command-agent.tool.js \
  gina-backend/agents/bot-replies.js \
  gina-backend/routes/run-command.js \
  gina-backend/frontend/src/App.jsx \
  gina-backend/GINA_TEAM_PROMPT_RULE.txt \
  gina-backend/applyAgentAction.replacement.js 2>/dev/null || true
git add -f gina-backend/frontend/dist 2>/dev/null || true
git add -A gina-backend/lib gina-backend/agents gina-backend/routes 2>/dev/null || true

git status
git commit -m "Board: slide candidates under correct stage columns (Kelley moves + normalize)" || true
git push || true

echo ""
echo "Done. Redeploy Gina Railway, hard-refresh the Board."
echo "Re-ask Kelley to reject Ivy Kim / advance Ava Foster to interview, then Check for actions."
