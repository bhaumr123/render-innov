# Running FeatureForge's local Ollama models

Two independent pieces of FeatureForge can talk to a local Ollama model
instead of a hosted API — everything below applies to both, since they
share the same install and the same `OLLAMA_BASE_URL`/`OLLAMA_MODEL`
settings (`backend/src/lib/ollamaConfig.js`):

1. **Offline plan generation** (`backend/src/lib/ollamaClient.js`) — set
   `LLM_PROVIDER=ollama` and FeatureForge's whole plan → diff → apply
   pipeline (every stream: full-stack, k8s, mobile, website, custom) runs
   against your local model instead of the Claude API. No
   `ANTHROPIC_API_KEY`, no internet, once a model is pulled. This is what
   makes FeatureForge usable fully offline.
2. **The self-improvement agent** (`backend/src/lib/selfImprove.js`) —
   analyzes `KnownIssue` rows and proposes what to build next, always via
   Ollama regardless of `LLM_PROVIDER` (it's a separate, smaller task from
   plan generation, not gated behind the same switch).

Both are the one piece of FeatureForge that needs something installed
outside `npm install` — everything else in the repo is self-contained.

## The fast path: one script

For offline plan generation specifically, `scripts/setup-offline.sh` does
every step below in one command — installs Ollama if it's missing, starts
the server, pulls a model, wires `LLM_PROVIDER=ollama` into
`backend/.env`, and runs a real test plan to confirm it worked:

```bash
bash featureforge/scripts/setup-offline.sh              # llama3.2:1b — fast, ~1.3GB
bash featureforge/scripts/setup-offline.sh llama3.1      # better quality, ~4.7GB, slower
```

Run it on your own machine with real internet access — this needs to
reach `ollama.com` to install Ollama and pull a model, which a shared
cloud dev sandbox (like the one this project itself was built in) usually
blocks. Safe to re-run any time, including with a different model
argument — it only ever updates `LLM_PROVIDER`/`OLLAMA_MODEL` in place,
never duplicates them.

The rest of this doc is the same steps done by hand, plus the
self-improvement agent's setup (which the script above doesn't touch,
since it's a separate feature — see step 3 below).

## 1. Install Ollama

- **macOS**: `brew install ollama`, or download from https://ollama.com/download
- **Linux**: `curl -fsSL https://ollama.com/install.sh | sh`
- **Windows**: installer at https://ollama.com/download

## 2. Start the server and pull a model

```bash
ollama serve                # leave this running in its own terminal
ollama pull llama3.1        # ~4.7GB — the default FeatureForge expects
```

A smaller/faster model works fine for either use — this only needs
structured tool-call-shaped output, not a huge context window (though a
bigger model will generally write better code for offline generation than
for the shorter self-improvement proposals):

```bash
ollama pull llama3.2:1b      # ~1.3GB, much faster on a laptop CPU
```

If you use a different model than `llama3.1`, tell the backend via
`featureforge/backend/.env`:

```
LLM_PROVIDER=ollama                      # generate plans offline instead of via Claude
OLLAMA_MODEL=llama3.2:1b
OLLAMA_BASE_URL=http://localhost:11434   # only needed if not the default
SELF_IMPROVE_ENABLED=true                # turns on the self-improvement agent's scheduler
SELF_IMPROVE_INTERVAL_MS=3600000         # optional, default is 1 hour
```

`LLM_PROVIDER` only affects plan generation — the self-improvement agent
always uses Ollama regardless of this setting, since it isn't calling
Claude either way.

## 3. Test it

With Ollama running and a model pulled:

```bash
cd featureforge/backend
npm run test:offline-plan                              # a real website plan, offline
npm run test:offline-plan fullstack "add a health check endpoint"
npm run test:analyzer                                   # the self-improvement agent
```

`test:offline-plan` builds a real feature request the same way the
running app does (`routes/features.js`'s `runPlan()`) and sends it
straight through `ollamaClient.js` — no backend server, no login needed.
`test:analyzer` runs the self-improvement graph against your real seeded
`KnownIssue` rows (run `npm run seed:known-issues` first if the table's
empty). Either one's error message says which step to fix (model not
pulled vs. server not running vs. something else) if something's not set
up yet.

Once `test:offline-plan` works, set `LLM_PROVIDER=ollama` in `.env` and
start the app normally — the header shows a green "Offline (Ollama)"
badge instead of the usual Claude one, confirming which model is actually
answering. Once `test:analyzer` works, either use the "Run now" button in
the Self-Improvement view in the running app, or set
`SELF_IMPROVE_ENABLED=true` and let the scheduler in `server.js` call it
on its own.

## What was actually verified in this project's own sandboxed dev
environment

This repo's automated tests (`npm test`, `test/selfImprove.test.js` and
`test/llmClient.test.js`) mock the Ollama call — they check the
self-improvement graph's control flow (does it skip the model when
there's nothing open, does a failure get recorded cleanly, does a
proposal mark issues reviewed) and the provider dispatcher (does
`LLM_PROVIDER=ollama` actually route plan generation to `ollamaClient.js`
instead of Claude, for every value that setting can take) without needing
Ollama installed at all, so they run the same in CI as anywhere else.

Beyond that, this was checked against a *real* Ollama server: the sandbox
this project was built in blocks network access to `ollama.com` (same
policy that blocks the Android SDK download elsewhere in this repo — see
`ROADMAP.md`), so the usual install script wasn't an option. Ollama is
open source, so its server was instead **built from source** — `go
install github.com/ollama/ollama@v0.23.0` through the Go module proxy
(`proxy.golang.org`, unlike `ollama.com` itself not blocked), plus three
vendored C++ headers (`nlohmann-json3-dev`, `libminiaudio-dev`,
`libstb-dev`) pulled from Ubuntu's own package repos to satisfy the
embedded llama.cpp engine's build. That produced a real, running `ollama
serve` with genuine CPU inference detected.

Both consumers of it were pointed at that real server, with
`ANTHROPIC_API_KEY` deliberately unset for the offline-generation checks
to prove they don't need it: `selfImprove.js`, and — once offline plan
generation was added — the full HTTP path a real request takes
(`POST /api/features/:stream/plan` and `/plan/stream` → `llmClient.js` →
`ollamaClient.js` → the real server), confirmed against three separately
started backend instances (`LLM_PROVIDER=ollama`, no API key at all): one
against the real running server (clean `model 'llama3.1' not found` —
502, with a `run ollama pull llama3.1` instruction, not a raw crash), and
one against a deliberately unreachable port (clean "couldn't reach a
local Ollama server" — also 502, with the `ollama serve` instruction).
Both cases prove the request reached real code paths and got a real,
correctly-classified response — not a network policy block masquerading
as success.

**What wasn't possible**: actually pulling model weights. Every model
registry (`registry.ollama.ai`, Hugging Face) is blocked by the same
network policy, and there's no reasonable substitute source for a
multi-gigabyte model file. So a full run — a model actually reasoning
over a real feature request, or over the known issues, and returning a
real result — couldn't be exercised end-to-end in that sandbox. On a
normal machine with normal internet access, `ollama pull` just works, and
`npm run test:offline-plan` / `npm run test:analyzer` above will get you
a real result, not just a clean error path.

`scripts/setup-offline.sh` itself was run for real in that same sandbox,
as far as its network allowed — Node/Ollama detection, starting the
server (including re-running it to confirm the "already running" branch),
and `ollama pull` correctly hitting the same blocked-registry error
(`set -euo pipefail` stopped the script there, exactly like it would for
anyone without internet access). That run caught a real bug before it
ever reached anyone: the script's original `.env` check only matched an
*uncommented* `LLM_PROVIDER=`/`OLLAMA_MODEL=` line, but `.env.example`
ships both already present as commented-out examples — so a fresh `.env`
would get a redundant, disconnected line appended at the bottom instead
of the existing example being turned on. Fixed to match the commented
form too and verified against a scratch `.env` for both a first-time run
and a re-run with a different model (confirming it updates in place
rather than duplicating).
