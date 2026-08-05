#!/usr/bin/env bash
# Apply Notes-style Pipeline overview formatting on Gina (Mac).
#
# Usage:
#   bash gina-express/frontend/APPLY-PIPELINE-NOTES-FORMAT.sh ~/lyday-gina-backend
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

echo "== Apply Notes-style pipeline briefing =="
node "$AI_ATS/gina-express/frontend/patch-clean-pipeline-briefing.mjs" "$GINA_BACKEND"
node "$AI_ATS/gina-express/frontend/patch-pipeline-include-team-updates.mjs" "$GINA_BACKEND" || true
node "$AI_ATS/gina-express/frontend/fix-gina-pipeline-description.mjs" "$GINA_BACKEND/gina.js" || \
  node "$AI_ATS/gina-express/frontend/fix-gina-pipeline-description.mjs" "$GINA_BACKEND" || true

# Ensure formatter + route files are current
mkdir -p "$GINA_BACKEND/briefing" "$GINA_BACKEND/routes"
cp -f "$AI_ATS/gina-express/briefing/format-pipeline-stage-counts.js" "$GINA_BACKEND/briefing/"
cp -f "$AI_ATS/gina-express/routes/pipeline-briefing.js" "$GINA_BACKEND/routes/"
cp -f "$AI_ATS/gina-express/GINA_TEAM_PROMPT_RULE.txt" "$GINA_BACKEND/" 2>/dev/null || true

if [[ -d "$GINA_BACKEND/frontend" ]]; then
  echo "== Rebuild frontend dist (Jobs rollup in overview) =="
  (cd "$GINA_BACKEND/frontend" && npm run build) || true
fi

echo "== Commit + push Gina =="
cd "$ROOT"
git add \
  gina-backend/briefing/format-pipeline-stage-counts.js \
  gina-backend/routes/pipeline-briefing.js \
  gina-backend/gina.js \
  gina-backend/server.js \
  gina-backend/GINA_TEAM_PROMPT_RULE.txt \
  gina-backend/frontend/src/App.jsx 2>/dev/null || true
git add -A gina-backend/briefing gina-backend/routes/pipeline-briefing.js gina-backend/gina.js 2>/dev/null || true
git add -f gina-backend/frontend/dist 2>/dev/null || true

git status
git commit -m "Pipeline overview: Jobs rollup (title, screening, interviewing, hired)" || true
git pull origin main --rebase || true
git push origin main

echo ""
echo "Done. After Railway redeploy, ask Gina:"
echo "  Give me the pipeline overview"
echo "Expect Notes-style sections plus Jobs in pipeline:"
echo "  Job Title / Names in Screening / Names Interviewing / Candidate Hired"
