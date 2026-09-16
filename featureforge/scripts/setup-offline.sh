#!/usr/bin/env bash
# One-command bootstrap for running FeatureForge fully offline, against a
# local Ollama model instead of the Claude API — so plan generation stops
# costing API tokens. Run this on your own machine, not in a cloud dev
# sandbox: it needs real internet access to install Ollama and pull a
# model, and installs/downloads things a shared sandbox often blocks.
#
# Usage (from anywhere):
#   bash featureforge/scripts/setup-offline.sh              # llama3.2:1b (~1.3GB, fast)
#   bash featureforge/scripts/setup-offline.sh llama3.1      # ~4.7GB, better quality, slower
set -euo pipefail

MODEL="${1:-llama3.2:1b}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FEATUREFORGE_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$FEATUREFORGE_DIR/backend"

echo "== Checking Node.js =="
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js isn't installed. Install it first, then re-run this script:"
  echo "  brew install node        (macOS)"
  echo "  (or download from https://nodejs.org)"
  exit 1
fi
echo "Node $(node -v) OK"

echo
echo "== Checking Ollama =="
if command -v ollama >/dev/null 2>&1; then
  echo "Already installed."
else
  echo "Not found — installing."
  case "$(uname -s)" in
    Darwin)
      if command -v brew >/dev/null 2>&1; then
        brew install ollama
      else
        echo "No Homebrew found. Either install Homebrew (https://brew.sh) and"
        echo "re-run this script, or download Ollama directly from"
        echo "https://ollama.com/download, then re-run this script."
        exit 1
      fi
      ;;
    Linux)
      curl -fsSL https://ollama.com/install.sh | sh
      ;;
    *)
      echo "Automatic install isn't supported on this OS. Download Ollama from"
      echo "https://ollama.com/download, then re-run this script."
      exit 1
      ;;
  esac
fi

echo
echo "== Starting the Ollama server =="
if curl -sS -m 2 http://localhost:11434/ >/dev/null 2>&1; then
  echo "Already running."
else
  echo "Starting \`ollama serve\` in the background (log: /tmp/ollama-serve.log)..."
  nohup ollama serve >/tmp/ollama-serve.log 2>&1 &
  disown
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    curl -sS -m 2 http://localhost:11434/ >/dev/null 2>&1 && break
    sleep 1
  done
  if ! curl -sS -m 2 http://localhost:11434/ >/dev/null 2>&1; then
    echo "Ollama's server didn't come up after 10s — check /tmp/ollama-serve.log."
    exit 1
  fi
fi

echo
echo "== Pulling $MODEL (first time only — can take a few minutes) =="
ollama pull "$MODEL"

echo
echo "== Configuring backend/.env =="
if [ ! -f "$BACKEND_DIR/.env" ]; then
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  # JWT_SECRET just needs to be long and random, not chosen by you.
  GENERATED_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  sed -i.bak "s/^JWT_SECRET=.*/JWT_SECRET=${GENERATED_SECRET}/" "$BACKEND_DIR/.env"
  echo "Created backend/.env from the template (JWT_SECRET generated for you)."
fi
# Idempotent, and matches .env.example's own commented-out example lines
# (e.g. "# LLM_PROVIDER=ollama") too, not just an already-uncommented one —
# otherwise a fresh .env (copied from the template, which already has both
# vars present but commented) ends up with a duplicate, disconnected line
# appended at the bottom instead of the existing example being turned on.
if grep -qE "^#?[[:space:]]*LLM_PROVIDER=" "$BACKEND_DIR/.env"; then
  sed -i.bak -E "s/^#?[[:space:]]*LLM_PROVIDER=.*/LLM_PROVIDER=ollama/" "$BACKEND_DIR/.env"
else
  echo "LLM_PROVIDER=ollama" >> "$BACKEND_DIR/.env"
fi
if grep -qE "^#?[[:space:]]*OLLAMA_MODEL=" "$BACKEND_DIR/.env"; then
  sed -i.bak -E "s/^#?[[:space:]]*OLLAMA_MODEL=.*/OLLAMA_MODEL=${MODEL}/" "$BACKEND_DIR/.env"
else
  echo "OLLAMA_MODEL=${MODEL}" >> "$BACKEND_DIR/.env"
fi
rm -f "$BACKEND_DIR/.env.bak"
echo "backend/.env set to LLM_PROVIDER=ollama, OLLAMA_MODEL=${MODEL}."

echo
echo "== Installing backend dependencies (if needed) =="
if [ -d "$BACKEND_DIR/node_modules" ]; then
  echo "Already installed."
else
  (cd "$BACKEND_DIR" && npm install)
fi

echo
echo "== Testing a real offline plan =="
(cd "$BACKEND_DIR" && npm run test:offline-plan)

echo
echo "== Done =="
echo "FeatureForge now generates offline with ${MODEL} — no Claude API"
echo "tokens spent on plan generation from here on."
echo "Start it normally:  cd $BACKEND_DIR && npm run dev"
echo "The header shows a green \"Offline (Ollama)\" badge once you sign in,"
echo "confirming it's actually running against your local model."
