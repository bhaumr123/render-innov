#!/usr/bin/env bash
# One-command bootstrap for running FeatureForge locally on macOS.
# Run from anywhere: bash featureforge/scripts/setup-mac.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FEATUREFORGE_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$FEATUREFORGE_DIR/backend"
FRONTEND_DIR="$FEATUREFORGE_DIR/frontend"

echo "== Checking Node.js =="
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js isn't installed. Install it first:"
  echo "  brew install node"
  echo "  (or download from https://nodejs.org)"
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node $(node -v) found, but FeatureForge needs 18+. Upgrade with:"
  echo "  brew upgrade node"
  exit 1
fi
echo "Node $(node -v) OK"

echo
echo "== Installing backend dependencies =="
(cd "$BACKEND_DIR" && npm install)

echo
echo "== Installing frontend dependencies =="
(cd "$FRONTEND_DIR" && npm install)

echo
if [ ! -f "$BACKEND_DIR/.env" ]; then
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  # JWT_SECRET just needs to be long and random, not chosen by you — generate
  # a real one now so the only thing left to fill in by hand is the API key.
  GENERATED_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  # Portable in-place sed (macOS's `sed -i` needs an explicit, even if empty, backup suffix).
  sed -i.bak "s/^JWT_SECRET=.*/JWT_SECRET=${GENERATED_SECRET}/" "$BACKEND_DIR/.env"
  rm -f "$BACKEND_DIR/.env.bak"
  echo "== Created backend/.env from the template (JWT_SECRET generated for you) =="
  echo "Open $BACKEND_DIR/.env and paste your real Anthropic API key in"
  echo "(get one free at https://console.anthropic.com), then re-run this"
  echo "script or start the servers yourself — see below."
else
  echo "backend/.env already exists — leaving it as is."
fi

echo
echo "== Applying database migrations =="
(cd "$BACKEND_DIR" && npx prisma migrate deploy)

echo
echo "== Setup complete =="
echo "Start the backend   (in one terminal tab):  cd $BACKEND_DIR && npm run dev"
echo "Start the frontend  (in another tab):        cd $FRONTEND_DIR && npm run dev"
echo "Then open:                                   http://localhost:5173"
