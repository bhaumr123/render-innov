# FeatureForge — Learn Full-Stack by Building an AI Dev Tool

This is our learning project, built from scratch, living alongside
`render-innov` in this same repo. Everything here is real, runnable code —
not a toy.

## What we're building

**FeatureForge**: a small full-stack tool. You describe a feature in plain
English → it reads the target app's current code → calls the Claude API to
design the change → shows you a **file-by-file diff** of exactly what would
change → and, once you approve, **writes those changes to disk for real**.

The app it modifies is `featureforge/tripcraft-app/`, which starts **empty**.
So instead of me hand-writing the rest of TripCraft (the trip-itinerary app
from our original plan), we use FeatureForge *itself* to build it, feature
by feature — you'll watch real diffs land in `tripcraft-app/` as we go. Two
projects, one set of lessons: building FeatureForge teaches you full-stack +
AI-API-integration fundamentals; using it produces a second real app as a
side effect.

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
     |                                  \
     |  reads/writes files               \  server-side HTTPS call
     v                                     v  (API key stays in backend .env)
featureforge/tripcraft-app/   <——applies plan——   Anthropic Claude API
 (the target app being built)                    (returns structured JSON:
                                                   which files, what content,
                                                   why)
     ^
     |  Prisma ORM
     v
SQLite / Postgres DB
 (stores your account + history of feature requests + diffs)
```

**Key principles:**
- The browser never talks to Claude directly — it always goes through our
  backend, which holds the secret API key. Same rule as before, still the
  standard pattern for any third-party API.
- Claude never writes to disk directly. It returns a *plan* (JSON); our
  backend code decides whether/how to apply it. The AI proposes, our code
  disposes — this separation is what makes the "review the diff first"
  step possible and safe.

## Learning curve — modules

Each module = one concept explained + one hands-on session + one commit.
We go in order; nothing here is optional filler.

0. **Environment & how the web works** — HTTP request/response, client vs.
   server, terminal basics, git, Node/npm. ✅ *Done.*
1. **Backend foundations** — Express server, routing, JSON responses, REST
   conventions. ✅ *Done: `GET /api/health`.*
2. **Structured AI output** — the Anthropic SDK, secrets/env vars, prompt
   design, and **forced tool-use** to get reliable JSON back instead of
   free text. *Deliverable: `POST /api/features/plan` calls Claude and
   returns a structured change plan (no files touched yet).*
3. **Diffing & safe file writes** — reading a project's file tree, computing
   unified diffs, applying changes to disk deliberately (never blindly).
   *Deliverable: the plan endpoint returns real file-by-file diffs;
   `POST /api/features/apply` writes them; first real feature lands in
   `tripcraft-app/`.*
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
12. **Stretch goals** (pick any, later): stream Claude's response
    token-by-token, let FeatureForge run tests on the target app before
    offering to apply a change, undo/rollback a past feature, support
    multiple target projects.

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
- [ ] Module 2 — Claude structured-output plan endpoint
- [ ] Module 3 — diffing & apply (first real feature built into tripcraft-app/)
- [ ] Module 4 — database (persist history)
- [ ] Module 5 — auth
- [ ] Module 6 — frontend foundations
- [ ] Module 7 — frontend wired to backend (diff viewer)
- [ ] Module 8 — frontend auth
- [ ] Module 9 — polish
- [ ] Module 10 — testing
- [ ] Module 11 — deployment
