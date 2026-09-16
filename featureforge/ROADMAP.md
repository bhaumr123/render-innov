# FeatureForge — Learn Full-Stack by Building an AI Dev Tool

This is our learning project, built from scratch, living alongside
`render-innov` in this same repo. Everything here is real, runnable code —
not a toy.

## What we're building

**FeatureForge**: a small full-stack tool. You describe a feature — via a
guided form tailored to what you're building — → it reads the target app's
current code → calls the Claude API to design the change → shows you a
**file-by-file diff** of exactly what would change → and, once you approve,
**writes those changes to disk for real**.

The frontend's request form (`FeatureRequestForm.jsx`) switches its fields
by type: Full-Stack, Mobile, and Kubernetes each ask for what that domain
actually needs (a Kubernetes replica count, a mobile screen name) instead
of one free-text paragraph you might forget details in. A custom stream
keeps the original free-text box, since FeatureForge can't know a
runtime-registered stream's domain-specific fields in advance. Whichever
form you use, the answers get composed into the same kind of description
the backend always expected — the API itself didn't need to change.

FeatureForge isn't tied to one kind of output. It has **streams** — each one
a named target directory plus a system prompt tuned for what belongs there:

- **`fullstack`** → writes to `featureforge/tripcraft-app/`. Application
  code: backend API, frontend, database.
- **`k8s`** → writes to `featureforge/k8s-deploy/`. Deployment artifacts:
  Dockerfiles, Kubernetes manifests (Deployment, Service, ConfigMap, ...).
- **`mobile`** → writes to `featureforge/tripcraft-app/mobile/`. A native
  Android (Kotlin, Gradle) client.
- Plus any **custom stream** you register at runtime via
  `POST /api/features/streams` — its own directory under
  `featureforge/custom/`, no code change or restart needed.

All target directories start **empty**. So instead of me hand-writing the
rest of TripCraft (the trip-itinerary app from our original plan) *and*
separately hand-writing its Kubernetes manifests, we use FeatureForge
*itself* to build both — you'll watch real diffs land in each directory as
we go. Three projects, one set of lessons: building FeatureForge teaches you
full-stack + AI-API-integration fundamentals; using it produces a real app
*and* its deployment config as a side effect.

## Why this project

- It touches every layer of full-stack development: database, REST API,
  auth, a third-party API integration, and a real frontend UI with state —
  same as our original plan.
- The third-party API is Anthropic's **Claude API**, used for something more
  interesting than free text: **structured output** (forced tool-calling to
  get back reliable JSON) that we then treat as a set of file writes. This
  is a real pattern, not a toy — it's the same idea behind code-review bots,
  scaffolding CLIs, and coding agents (including the one you're talking to).
- FeatureForge stays useful after the course ends — you can point it at your
  own future projects.

## Tech stack

One language end-to-end (JavaScript), so you're not learning two languages
and a framework simultaneously:

| Layer            | Choice                                     |
|-------------------|---------------------------------------------|
| Frontend          | React (Vite) + React Router + Tailwind CSS  |
| Backend           | Node.js + Express (REST API)                |
| Database          | SQLite (dev) via Prisma ORM                 |
| Auth              | bcrypt password hashing + JWT               |
| Third-party API   | Anthropic Claude API (forced tool-use → JSON) |
| Diffing           | the `diff` npm package (unified diffs)      |
| Deployment        | Render (same platform as `render-innov`)    |

## Architecture (the model)

```
Browser (React SPA) — FeatureForge's own UI
     |  fetch/axios over HTTPS, JSON
     v
Express REST API (featureforge/backend)
POST /api/features/:stream/plan
POST /api/features/:stream/apply
     |                                  \
     |  reads/writes files               \  server-side HTTPS call
     |  (scoped to that stream's root)     \  (API key stays in backend .env,
     v                                       v  system prompt varies by stream)
   +-------------------+-------------------+     Anthropic Claude API
   v                   v                         (returns structured JSON:
tripcraft-app/     k8s-deploy/                    which files, what content,
(fullstack stream) (k8s stream)                   why)
     ^
     |  Prisma ORM
     v
SQLite / Postgres DB
 (stores your account + history of feature requests + diffs, across streams)
```

**Key principles:**
- The browser never talks to Claude directly — it always goes through our
  backend, which holds the secret API key. Same rule as before, still the
  standard pattern for any third-party API.
- Claude never writes to disk directly. It returns a *plan* (JSON); our
  backend code decides whether/how to apply it. The AI proposes, our code
  disposes — this separation is what makes the "review the diff first"
  step possible and safe.
- A stream is just configuration (a root directory + a system prompt) — the
  plan/diff/apply code has no idea whether it's looking at JavaScript or
  Kubernetes YAML. Adding a third stream later (say, `docs`) means adding
  one entry to `STREAMS` and one prompt, not new plumbing.
- Each stream writes only inside its own root — enforced in code, not just
  by convention — so a `k8s` plan can never accidentally land inside
  `tripcraft-app/` or vice versa.

## Learning curve — modules

Each module = one concept explained + one hands-on session + one commit.
We go in order; nothing here is optional filler.

0. **Environment & how the web works** — HTTP request/response, client vs.
   server, terminal basics, git, Node/npm. ✅ *Done.*
1. **Backend foundations** — Express server, routing, JSON responses, REST
   conventions. ✅ *Done: `GET /api/health`.*
2. **Structured AI output** — the Anthropic SDK, secrets/env vars, prompt
   design, and **forced tool-use** to get reliable JSON back instead of
   free text. ✅ *Done: `POST /api/features/:stream/plan` calls Claude and
   returns a structured change plan (no files touched yet).*
3. **Diffing & safe file writes** — reading a project's file tree, computing
   unified diffs, applying changes to disk deliberately (never blindly).
   ✅ *Done: the plan endpoint returns real file-by-file diffs;
   `POST /api/features/:stream/apply` writes them.*
3b. **Multiple streams** — same pipeline, different target + system prompt.
   ✅ *Done: `fullstack` (→ `tripcraft-app/`) and `k8s` (→ `k8s-deploy/`),
   each sandboxed to its own directory. `GET /api/features/streams` lists
   them. Still to do: actually run a request through each stream and watch
   the first real files land.*
4. **Database** — relational modeling, Prisma schema, migrations, CRUD.
   *Deliverable: persist every feature request + its diff + outcome to a
   DB, so FeatureForge has history.*
5. **Auth** — password hashing, JWT issuing/verifying, middleware,
   protected routes. *Deliverable: FeatureForge requires login; history is
   scoped per user.*
6. **Frontend foundations** — components, JSX, props/state, hooks. 
   *Deliverable: a form to type a feature request.*
7. **Frontend ↔ backend** — fetch calls, loading/error states, React
   Router pages (Request Feature, Review Diff, History). *Deliverable: a
   real diff viewer UI — see additions/deletions per file, click Apply.*
8. **Frontend auth** — signup/login pages, storing/using the JWT, protected
   routes, logout.
9. **Polish** — validation, empty/error states, a real styling pass,
   responsive layout.
10. **Testing** — backend unit/integration tests (Vitest + supertest), one
    frontend component test.
11. **Deployment** — env vars, deploying backend + frontend to Render,
    production DB, CORS.
12. **Stretch goals** (pick any) — ✅ two done:
    - ✅ **Stream Claude's response token-by-token.** New SSE endpoint
      (`POST /:stream/plan/stream`) built on the exact same plan logic as
      `/plan`; the frontend shows Claude "writing" the plan live.
    - ✅ **Support multiple target projects.** A `Stream` DB table plus
      `POST /api/features/streams` lets you register a brand-new target
      directory at runtime — its own system prompt, its own sandboxed
      folder under `featureforge/custom/`, usable immediately. Verified
      live, in a real browser: registered one, planned and applied a real
      feature into it.
    - ⬜ Let FeatureForge run tests on the target app before offering to
      apply a change.
    - ⬜ Undo/rollback a past feature.
    - ⬜ Swap SQLite → Postgres.

Once FeatureForge can plan + diff + apply, every module after that (4-11)
gets *exercised on itself* AND used to keep growing `tripcraft-app/` — e.g.
Module 6-8's frontend work doubles as practice for whatever UI
`tripcraft-app/` itself needs, once we start feeding it feature requests
like "add a trip request form" through FeatureForge.

## How each session works

- I explain the concept in plain terms first — the *why*, not just the *how*.
- We write the code together, live, right in this repo.
- Each module ends in a real, working commit you can look back on later.
- Ask me to slow down, go deeper, or skip ahead any time — this is your pace.
- Say "quiz me" whenever you want a comprehension check before moving on.
- Run `node featureforge/scripts/changelog.js` any time you want a report
  of what's changed so far, grouped by area.

## Prerequisites

- A free Anthropic API key from console.anthropic.com, added to
  `featureforge/backend/.env` as `ANTHROPIC_API_KEY=...` (that file is
  gitignored — never commit it). Needed starting Module 2.
- That's it — Node.js is already installed in this environment.

## Progress

- [x] Module 0 — environment & scaffold
- [x] Module 1 — first Express endpoint
- [x] Module 2 — Claude structured-output plan endpoint
- [x] Module 3 — diffing & apply
- [x] Module 3b — multiple streams (`fullstack`, `k8s`), each sandboxed
- [x] Module 6 — frontend foundations (React + Vite, form UI)
- [x] Module 7 — frontend wired to backend (real diff viewer, apply button)
- [x] Module 3c — first real feature run end-to-end, both streams:
  - `fullstack` generated a real Express backend into
    `tripcraft-app/backend/` (package.json, app.js, server.js, health
    route, .gitignore) from a live Claude API call. It runs —
    `GET /api/health` on :3001 responds for real.
  - `k8s` generated a Dockerfile, Deployment, Service, and ConfigMap into
    `k8s-deploy/base/`. Two real bugs found and fixed along the way:
    1. Forced tool-use didn't guarantee our schema's `summary` field came
       back populated — `/plan` now defaults it instead of silently
       returning `undefined`.
    2. The `k8s` stream had no visibility into what `fullstack` actually
       built, so its first attempt guessed a wrong entry point
       (`server.js` vs. the real `src/server.js`) and a wrong health-check
       path (`/healthz` vs. the real `/api/health`). Fixed by giving
       streams an optional `referenceStreams` list — `k8s` now reads
       `fullstack`'s files as read-only context. Second attempt matched
       reality exactly. Also caught (and now guard against) a path bug:
       Claude prefixed paths with the stream's own root directory name
       ("k8s-deploy/base/..." on top of the root already being
       k8s-deploy/), which would have double-nested every file — fixed
       the prompt and added `looksLikeDuplicatedRoot()` as a backstop
       that rejects a plan outright rather than silently mis-writing it.
- [x] Module 4 — database. Prisma + SQLite, two models (`User`,
      `FeatureRequest`, one-to-many). Every `/plan` now creates a DB row
      (status `"planned"`) instead of an in-memory Map entry; `/apply`
      flips it to `"applied"` and stamps `appliedAt`. New
      `GET /api/features/history` lists a user's past requests. Verified:
      history persists a plan correctly, a second `/apply` on the same
      plan correctly 409s instead of double-writing.
- [x] Module 5 — auth. bcryptjs password hashing, JWT (7-day expiry),
      `requireAuth` middleware in front of every `/api/features/*` route.
      `POST /api/auth/signup` and `/login`; same error for "no such user"
      and "wrong password" so a client can't enumerate accounts. Verified:
      signup → login → authenticated request all work, duplicate signup
      409s, wrong password 401s, missing/invalid token 401s.
  - Also patched the frontend to match (a lightweight stand-in for the
    full Module 8 polish still ahead): a login/signup gate
    (`Auth.jsx`), a token stored in `localStorage` and attached to every
    request (`api.js`), and a simple history panel in the main view.
    Compiles clean, no errors.
- [x] Module 8 — frontend auth, properly. New `GET /api/auth/me`
      (protected) so the frontend can confirm a stored token still works
      instead of assuming it does; `apiFetch` now attaches the HTTP status
      to thrown errors. App.jsx validates on load and bounces to login
      with a visible "your session expired" message on any 401, including
      one hit mid-session. Verified: no-token, garbage-token, and
      valid-token cases against `/api/auth/me` all behave correctly.
- [x] Module 9 — polish. Visible `:focus-visible` ring (this is a
      keyboard-heavy review workflow), button hover/active states, subtle
      card shadows, a real "no requests yet" empty state instead of just
      hiding the history section, consistent spacing, a narrow-screen
      tweak.
- [x] Module 10 — testing. Split `server.js` into `app.js` (the Express
      app) + a thin `server.js` (just `app.listen`), so the app is
      importable without binding a real port. Backend: Vitest + supertest,
      16 tests — unit tests for `unifiedDiff` and for
      `looksLikeDuplicatedRoot` (a regression test for the real k8s
      path-duplication bug), plus a real integration suite for signup/
      login/`/api/auth/me` against a dedicated throwaway SQLite database
      (never `dev.db` — verified the real one was untouched afterward).
      Frontend: Vitest + React Testing Library, `DiffView` extracted to
      its own file and tested directly (correctly classifies `+`/`-`
      content lines vs. the `---`/`+++` patch headers that start with the
      same characters). `npm run build` verified to succeed.
  - `npm audit` (both backend and frontend) flags several vulnerabilities
    after adding the test tooling — all inside `vitest`'s own dependency
    tree (esbuild/vite dev-server issues, dev-only) plus one in `diff`
    (a DoS in `parsePatch`/`applyPatch`). Checked: we only ever call
    `createTwoFilesPatch`, never `parsePatch` or `applyPatch`, so that
    specific path doesn't apply to how we use it. Left as-is rather than
    `npm audit fix --force`, which would pull in breaking major versions
    for no real safety gain here — worth re-checking before Module 11
    actually ships anywhere public.
- [x] Module 11 — deployment prep. `featureforge/render.yaml`: a Render
      Blueprint with two services (Node backend, static frontend) —
      separate from the repo's root `render.yaml`, which is the actual
      live render-innov app and was deliberately left untouched. Made
      the two things a real deployment needs configurable instead of
      hardcoded: `CORS_ORIGIN` (backend) and `VITE_API_BASE` (frontend,
      baked in at build time via Vite's `import.meta.env`) — both default
      to today's wide-open/localhost behavior when unset, so local dev
      needed zero changes (re-ran the full test suite and a frontend
      build to confirm). `DEPLOYMENT.md` walks through applying the
      blueprint, matching the style of the repo's existing
      `RENDER_DEPLOYMENT.md`.
      **Honest limitation, documented rather than solved**: `FeatureRequest`/
      `User` data lives in SQLite on the backend's own disk, which is
      ephemeral on Render's free tier — a redeploy or restart wipes it.
      Real fix is Module 12's still-open "swap SQLite → Postgres" stretch
      goal, or a paid persistent disk; not implemented here.
      **What I didn't do**: actually click Deploy. That needs your own
      Render account — everything above is prepared and locally verified,
      not live anywhere.
- [x] Module 12 (partial — stretch goals, pick any) —
  - **Streaming**: `planFeatureStream()` uses the Anthropic SDK's
    `messages.stream()`, relaying `input_json_delta` events over a new
    `POST /:stream/plan/stream` SSE endpoint built on the exact same
    `runPlan()` logic as `/plan`. Frontend shows a live "Claude is
    writing…" preview. Verified with real curl and browser runs.
  - **Custom streams**: a `Stream` DB table + `POST /api/features/streams`
    lets you register a new target project at runtime — own directory
    under `featureforge/custom/`, own system prompt, usable immediately,
    no restart. Verified live through the actual browser UI: registered
    one, planned and applied a real feature into it.
  - **Mobile (Android) stream**: added as a third built-in stream (like
    `fullstack`/`k8s`, not a runtime registration) → writes to
    `tripcraft-app/mobile/`. Native Kotlin + Gradle Kotlin DSL, referencing
    the `fullstack` stream for the real backend's port/response shape —
    same lesson as k8s: match reality, don't guess. Verified live: a real
    request generated a complete, well-formed Android project (all 7 XML
    files parse; `gradle help` correctly parses both Kotlin DSL build
    files and gets as far as resolving the Android Gradle Plugin before
    failing). **Honest limitation**: this environment can't reach
    `dl.google.com` (blocked by network policy) or Google's Maven repo, so
    an actual compiled/signed APK can't be produced here — FeatureForge
    generates real, valid source; building it needs Android Studio (or
    the Android SDK + Gradle) on your own machine, where Gradle sync also
    generates the wrapper's binary jar that a text-only tool can't write.
  - **Type-specific request forms**: `FeatureRequestForm.jsx` replaced the
    single stream-dropdown + free-text box with a Full-Stack / Mobile /
    Kubernetes / Custom-stream switcher — each built-in type has guided
    fields (e.g. Kubernetes' resource type + replica count, mobile's
    screen name + "calls the backend API?") composed into the same kind
    of description the backend already expected, so no API change was
    needed. Verified live: submitted a real Kubernetes ConfigMap request
    through the guided form, watched it stream, applied it, confirmed
    the exact YAML on disk.
  - **Studio dashboard**: `Dashboard.jsx` — a real home screen with a card
    per build type (build count + last-built date, computed client-side
    from history already being loaded), replacing "land straight on a
    form" with "land on an overview, pick what you're building." Simple
    view-state navigation (`dashboard` | `build`) since there's no router
    yet. Verified live: clicking a card opens the build screen
    pre-selected to that type; the type's own history shows instead of
    everything mixed together.
  - **Self-improvement agent**: FeatureForge now learns from its own real
    bugs instead of just the two apps it builds. `KnownIssue` (a real bug,
    tagged by area) and `ImprovementRun` (a record of one review pass)
    are new Prisma models; `prisma/seed-known-issues.js` seeded 6 genuine
    bugs hit earlier in this project (the forced-tool-use `summary` gap,
    the k8s wrong-entry-point guess, the duplicated-root path bug, the
    Chromium `pattern`-regex break, `changelog.js`'s comma bug, and
    `POST /:stream/apply` having no try/catch at all — found *while
    building this feature*, since every route needed a
    `maybeLogFailure()` hook and this one had nowhere to add it). Every
    route in `features.js` now auto-logs a new `KnownIssue` on a genuinely
    unexpected error (not our own thrown domain errors, not "you haven't
    configured X" messages) — the memory keeps growing on its own.
    `lib/selfImprove.js` is a small **LangGraph** `StateGraph`: gather open
    issues → a real conditional branch (skip the model entirely if there's
    nothing to review) → ask a local **Ollama** model
    (`@langchain/ollama`'s `ChatOllama` + `withStructuredOutput`, the same
    "trust the shape, not the fields" lesson as forced tool-use) to find a
    pattern and propose one concrete next step → record an
    `ImprovementRun`. Deliberately stops at a *written* proposal, not an
    auto-applied diff — no FeatureForge stream targets FeatureForge's own
    source, and wiring one in safely is a real open question, not
    something to hand-wave past.
    `lib/scheduler.js` makes "periodically improve" actually periodic: a
    `setInterval` gated behind `SELF_IMPROVE_ENABLED=true`
    (`SELF_IMPROVE_INTERVAL_MS` configurable, default 1 hour), started
    only from `server.js` — never `app.js`, which the test suite imports
    directly, so a background timer there would leak into every test run.
    New routes (all behind `requireAuth`, like everything else in this
    API): `POST /api/self-improve/run` (manual trigger), `GET
    /api/self-improve/issues`, `GET /api/self-improve/runs`. A minimal
    `SelfImprove.jsx` view (new header nav button, reusing the existing
    history-list/badge styles rather than inventing new ones) shows open
    issues and past runs with a "Run now" button.
    **Verified live, twice** — once via a standalone script hitting the
    real seeded `dev.db` directly, once through `curl` against a running
    server, and once more end-to-end in an actual browser via Playwright
    (screenshot confirmed 6 real issues listed, "Run now" clicked, the run
    recorded and rendered with its status badge): `gatherIssues()`
    correctly pulls the real `KnownIssue` rows, the conditional edge
    correctly routes to the Ollama call when issues exist, and — since
    this environment's network policy blocks reaching an Ollama server the
    same way it blocks `dl.google.com` for the Android SDK — the resulting
    `fetch failed` is caught cleanly by `runSelfImprovement`'s own
    try/catch and recorded as `status: "error"` rather than crashing
    anything. Everything up to that call — the schema, the seed data, the
    auto-logging hooks, the graph's control flow, the scheduler, the
    routes, and the frontend — is real, running code, verified against a
    real database and a real browser.
  - **Went further**: `test/selfImprove.test.js` (5 tests, `@langchain/ollama`
    mocked) is a real, CI-safe regression suite for the graph's control
    flow — no open issues skips the model entirely, a proposal marks
    issues reviewed, a model failure is recorded as an error without
    touching issue status, "nothing actionable" still marks issues
    reviewed, and a run caps out at `MAX_ISSUES_PER_RUN`. Separately, this
    sandbox's network policy blocking `ollama.com` (the same policy that
    blocks the Android SDK) turned out not to block `proxy.golang.org` or
    Ubuntu's own apt repos — so Ollama's server was **built from source**
    (`go install github.com/ollama/ollama@v0.23.0`, three vendored C++
    headers pulled from apt to satisfy its embedded llama.cpp engine) and
    actually run here. Pointing `selfImprove.js` at that real server
    turned the earlier generic `fetch failed` into a precise `model
    'llama3.1' not found` — proof the HTTP integration itself is correct,
    not just the code around it. **Still an honest limitation**: every
    model registry (`registry.ollama.ai`, Hugging Face) is blocked too, so
    actual model weights — and therefore a real generated proposal —
    couldn't be produced in this sandbox. `OLLAMA_SETUP.md` has the normal
    install path (which just works with real internet access) plus a new
    `npm run test:analyzer` script (`backend/scripts/test-analyzer.js`)
    for manually exercising the analyzer against a real local model once
    you have one pulled.
  - Still open: run tests before applying, undo/rollback, SQLite → Postgres.
