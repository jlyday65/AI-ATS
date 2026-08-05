#!/usr/bin/env bash
# Apply Candidate File → Jobs tab + Board import fixes on Gina (Mac).
#
# Usage:
#   bash gina-express/frontend/APPLY-CANDIDATE-FILE-JOBS-BOARD.sh ~/lyday-gina-backend
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
git pull origin cursor/ai-ats-b2b-platform-4f1f || \
  git pull origin cursor/candidate-file-jobs-board-4f1f || \
  git pull || true

GINA_BACKEND="$ROOT"
if [[ -f "$ROOT/gina-backend/server.js" ]]; then
  GINA_BACKEND="$ROOT/gina-backend"
fi

echo "== Copy agent + prompt files =="
mkdir -p "$GINA_BACKEND/agents" "$GINA_BACKEND/lib" "$GINA_BACKEND/routes"
cp -f "$AI_ATS/gina-express/agents/candidate-file.tool.js" "$GINA_BACKEND/agents/"
cp -f "$AI_ATS/gina-express/agents/command-agent.tool.js" "$GINA_BACKEND/agents/"
cp -f "$AI_ATS/gina-express/agents/bot-replies.js" "$GINA_BACKEND/agents/" 2>/dev/null || true
cp -f "$AI_ATS/gina-express/routes/run-command.js" "$GINA_BACKEND/routes/"
cp -f "$AI_ATS/gina-express/GINA_TEAM_PROMPT_RULE.txt" "$GINA_BACKEND/" 2>/dev/null || true
# applyAgentAction.replacement.js is read by patch-check-for-actions.mjs from AI-ATS

echo "== Re-inject applyAgentAction + Jobs headcount into App.jsx =="
node "$AI_ATS/gina-express/frontend/patch-jobs-headcount.mjs" "$GINA_BACKEND"

FRONTEND="$GINA_BACKEND/frontend"
if [[ ! -f "$FRONTEND/package.json" ]]; then
  echo "No frontend/package.json under $GINA_BACKEND"
  exit 1
fi

echo "== Build frontend dist =="
cd "$FRONTEND"
npm run build
ls -la dist/assets/index-*.js | tail -3

echo "== Commit + push Gina =="
cd "$ROOT"
git add \
  gina-backend/frontend/src/App.jsx \
  gina-backend/agents/candidate-file.tool.js \
  gina-backend/agents/command-agent.tool.js \
  gina-backend/routes/run-command.js \
  gina-backend/GINA_TEAM_PROMPT_RULE.txt 2>/dev/null || true
# Paths vary — add whatever exists
git add -A gina-backend/frontend/src/App.jsx \
  gina-backend/agents \
  gina-backend/routes/run-command.js 2>/dev/null || true
git add -f gina-backend/frontend/dist 2>/dev/null || git add -f frontend/dist 2>/dev/null || true

git status
git commit -m "Candidate File: Jobs tab upsert + Board import on Check for actions" || true
git pull origin main --rebase || true
git push origin main

echo ""
echo "Done. After Railway redeploy:"
echo "  1) Hard-refresh Gina ATS (cache bust — confirm new dist hash)"
echo "  2) Re-queue Candidate File + full JD OR ask Gina to upsert the Detroit role"
echo "  3) Agent → Check for actions"
echo "  4) Jobs tab should list Auto Production Floor Supervisor with JD + Headcount"
echo "  Debug: window.__ginaLastJobUpsert → expect .description (full JD) and .headcount"
echo "  Scott Lewis / Noah Ibrahim skips are stale update_stage rows — ignore or clear them."
