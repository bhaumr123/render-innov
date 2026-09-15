# Running FeatureForge on your own machine

Everything we've built so far lives in this repo on branch
`claude/elegant-galileo-gpaeyl`. This session's container is temporary — it
gets reclaimed after inactivity — so if you want a persistent place to run
and keep developing FeatureForge, your Mac is exactly right. These are the
steps to get the current code running there.

## 1. Prerequisites

- **Node.js 18 or newer** (the Anthropic SDK requires it). Check what you
  have:
  ```bash
  node --version
  ```
  If you don't have it, install via [nodejs.org](https://nodejs.org) or,
  if you use Homebrew:
  ```bash
  brew install node
  ```
- **git**, already on macOS by default (`git --version` to confirm).

## 2. Clone the repo and get this branch

```bash
git clone https://github.com/bhaumr123/render-innov.git
cd render-innov
git checkout claude/elegant-galileo-gpaeyl
```

If you already have the repo cloned somewhere, just:
```bash
cd render-innov
git fetch origin claude/elegant-galileo-gpaeyl
git checkout claude/elegant-galileo-gpaeyl
git pull
```

## 3. Install the backend's dependencies

```bash
cd featureforge/backend
npm install
```

## 4. Add your Anthropic API key

```bash
cp .env.example .env
```
Open `.env` in any editor and replace the placeholder with your real key
from [console.anthropic.com](https://console.anthropic.com):
```
ANTHROPIC_API_KEY=sk-ant-your-real-key
```
`.env` is gitignored — it will never get committed or pushed. Don't paste
your key into chat, a commit, or anywhere else in the repo.

## 5. Run it

```bash
npm run dev
```
You should see:
```
FeatureForge backend listening on http://localhost:4000
```
`npm run dev` auto-restarts on file changes (via `node --watch`), so keep
this running in one terminal tab while we work.

## 6. Try it

In a second terminal tab:
```bash
curl http://localhost:4000/api/health

curl http://localhost:4000/api/features/streams

curl -X POST http://localhost:4000/api/features/fullstack/plan \
  -H 'Content-Type: application/json' \
  -d '{"description":"scaffold an Express backend with a health check endpoint"}'
```
The last one is the real test — with your key in place, that should return
a JSON plan with a `summary` and a `files` array, each with a unified
`diff`. Nothing gets written to `tripcraft-app/` until you also call
`/api/features/fullstack/apply` with the `planId` it gives you.

## Staying in sync with this session

While we keep working together in this chat, I'll keep committing and
pushing to `claude/elegant-galileo-gpaeyl`. Pull before you resume local
work:
```bash
git pull origin claude/elegant-galileo-gpaeyl
```
And if you make local changes you want kept, commit and push them the same
way — just say so and we'll coordinate rather than diverging silently.
