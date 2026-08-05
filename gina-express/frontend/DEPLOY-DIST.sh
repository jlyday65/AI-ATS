#!/usr/bin/env bash
# Force-deploy Gina frontend dist to GitHub (bypasses .gitignore).
#   bash ~/AI-ATS/gina-express/frontend/DEPLOY-DIST.sh
set -euo pipefail
ROOT="${ROOT:-$HOME/lyday-gina-backend}"
cd "$ROOT"

echo "=== repo root ==="
git rev-parse --show-toplevel
pwd

echo ""
echo "=== dist on disk ==="
ls -la gina-backend/frontend/dist/assets/index-*.js 2>/dev/null || ls -la gina-backend/frontend/dist/assets/ 2>/dev/null || echo "NO dist/assets"

echo ""
echo "=== dist/index.html script tag ==="
grep -oE 'assets/index-[^"]+\.js' gina-backend/frontend/dist/index.html 2>/dev/null || echo "no index.html ref"

echo ""
echo "=== ignore rules ==="
git check-ignore -v gina-backend/frontend/dist/assets/index-BDhGJLx5.js 2>/dev/null || \
  git check-ignore -v gina-backend/frontend/dist/index.html 2>/dev/null || \
  echo "(not ignored, or file missing)"

echo ""
echo "=== currently tracked dist files ==="
git ls-files 'gina-backend/frontend/dist/**' | head -50
echo "(count: $(git ls-files 'gina-backend/frontend/dist/**' | wc -l | tr -d ' '))"

echo ""
echo "=== assume-unchanged / skip-worktree? ==="
git ls-files -v 'gina-backend/frontend/dist/**' | head -20 || true

echo ""
echo "=== nested .git? ==="
ls -la gina-backend/frontend/.git 2>/dev/null || echo "no frontend/.git"
ls -la gina-backend/frontend/dist/.git 2>/dev/null || echo "no dist/.git"

echo ""
echo "=== rebuild ==="
cd gina-backend/frontend
npm run build
NEW_JS="$(ls -1 dist/assets/index-*.js | head -1)"
echo "NEW_JS=$NEW_JS"
cd "$ROOT"

echo ""
echo "=== force stage ==="
# Clear skip-worktree/assume-unchanged if set
while IFS= read -r f; do
  git update-index --no-skip-worktree -- "$f" 2>/dev/null || true
  git update-index --no-assume-unchanged -- "$f" 2>/dev/null || true
done < <(git ls-files 'gina-backend/frontend/dist/**')

git add -f -A gina-backend/frontend/dist
git add -f gina-backend/frontend/dist/index.html gina-backend/frontend/dist/assets/*.js 2>/dev/null || true

echo "Staged:"
git diff --cached --name-status | head -40
STAT="$(git diff --cached --name-only | grep 'frontend/dist' || true)"
if [ -z "$STAT" ]; then
  echo ""
  echo "ERROR: dist still not staged."
  echo "Comparing disk vs HEAD for index.html:"
  git show HEAD:gina-backend/frontend/dist/index.html 2>/dev/null | grep -oE 'assets/index-[^"]+\.js' || echo "(dist/index.html not in HEAD)"
  grep -oE 'assets/index-[^"]+\.js' gina-backend/frontend/dist/index.html || true
  echo ""
  echo "If HEAD already has the new hash, Railway is not picking up main — trigger Redeploy."
  echo "If HEAD has the OLD hash but staging is empty, paste this whole output to Cursor."
  exit 2
fi

git commit -m "Deploy frontend dist $(basename "$NEW_JS")"
git pull origin main --rebase
git push origin main
echo ""
echo "OK: pushed. Railway → Redeploy. Expect JS URL: $(basename "$NEW_JS")"
