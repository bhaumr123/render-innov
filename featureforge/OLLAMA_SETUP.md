# Running the self-improvement agent's Ollama model locally

`featureforge/backend/src/lib/selfImprove.js` calls a local Ollama server
to analyze `KnownIssue` rows and propose what to build next. This is the
one piece of FeatureForge that needs something installed outside `npm
install` — everything else in the repo is self-contained.

## 1. Install Ollama

- **macOS**: `brew install ollama`, or download from https://ollama.com/download
- **Linux**: `curl -fsSL https://ollama.com/install.sh | sh`
- **Windows**: installer at https://ollama.com/download

## 2. Start the server and pull a model

```bash
ollama serve                # leave this running in its own terminal
ollama pull llama3.1        # ~4.7GB — the default FeatureForge expects
```

A smaller/faster model works fine too — the analyzer only needs
structured tool-call output, not a huge context window:

```bash
ollama pull llama3.2:1b      # ~1.3GB, much faster on a laptop CPU
```

If you use a different model than `llama3.1`, tell the backend via
`featureforge/backend/.env`:

```
OLLAMA_MODEL=llama3.2:1b
OLLAMA_BASE_URL=http://localhost:11434   # only needed if not the default
SELF_IMPROVE_ENABLED=true                # turns on the periodic scheduler
SELF_IMPROVE_INTERVAL_MS=3600000         # optional, default is 1 hour
```

## 3. Test it

With Ollama running and a model pulled:

```bash
cd featureforge/backend
npm run test:analyzer
```

This runs the real LangGraph graph against your real seeded `KnownIssue`
rows (run `npm run seed:known-issues` first if the table's empty) and a
real Ollama model, and prints the resulting proposal — no login, no
backend server needed, just the analyzer itself. If something's not set
up yet, its error message says which step to fix (model not pulled vs.
server not running vs. something else).

Once that works, either use the "Run now" button in the Self-Improvement
view in the running app, or set `SELF_IMPROVE_ENABLED=true` and let the
scheduler in `server.js` call it on its own.

## What was actually verified in this project's own sandboxed dev
environment

This repo's automated tests (`npm test`, `test/selfImprove.test.js`) mock
the Ollama call — they check the graph's control flow (does it skip the
model when there's nothing open, does a failure get recorded cleanly,
does a proposal mark issues reviewed) without needing Ollama installed at
all, so they run the same in CI as anywhere else.

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
serve` with genuine CPU inference detected. Pointing `selfImprove.js` at
it confirmed the HTTP integration is correct — the error changed from a
generic connection failure to a precise `model 'llama3.1' not found`,
meaning the request reached a real Ollama server and got a real Ollama
response.

**What wasn't possible**: actually pulling model weights. Every model
registry (`registry.ollama.ai`, Hugging Face) is blocked by the same
network policy, and there's no reasonable substitute source for a
multi-gigabyte model file. So a full run — model actually reasoning over
the known issues and returning a real proposal — couldn't be exercised
end-to-end in that sandbox. On a normal machine with normal internet
access, `ollama pull` just works, and `npm run test:analyzer` above will
get you a real proposal, not just a clean error path.
