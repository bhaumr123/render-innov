# TripCraft AI — Learn Full-Stack by Building

This is our learning project, built from scratch, living alongside `render-innov`
in this same repo. Everything here is real, runnable code — not a toy.

## What we're building

**TripCraft AI**: you describe a trip (destination, number of days, interests,
budget) → the app calls the Claude API → Claude generates a structured
day-by-day itinerary → it's saved to your account → you can view/manage your
past trips.

## Why this project

- It touches every layer of full-stack development: database, REST API, auth,
  a third-party API integration, and a real frontend UI with state.
- The third-party API is Anthropic's **Claude API**. The pattern you'll learn —
  call an external API from your *server*, never your browser, keep the key
  secret, turn free-text into structured data — is the same pattern used for
  Stripe, Twilio, Google Maps, or any other API you'll touch later.
- It's small enough to actually finish, and real enough to deploy and show
  people when you're done.

## Tech stack

One language end-to-end (JavaScript), so you're not learning two languages
and a framework simultaneously:

| Layer          | Choice                                   |
|-----------------|-------------------------------------------|
| Frontend        | React (Vite) + React Router + Tailwind CSS |
| Backend         | Node.js + Express (REST API)              |
| Database        | SQLite (dev) via Prisma ORM               |
| Auth            | bcrypt password hashing + JWT             |
| Third-party API | Anthropic Claude API                      |
| Deployment      | Render (same platform as `render-innov`)  |

## Architecture (the model)

```
Browser (React SPA)
     |  fetch/axios over HTTPS, JSON
     v
Express REST API  -----  Prisma ORM  -----  SQLite / Postgres DB
     |
     |  server-side HTTPS call
     |  (Claude API key lives only in backend .env, never sent to browser)
     v
Anthropic Claude API
```

**Key principle:** the browser never talks to Claude directly. It always
goes through our backend, which holds the secret API key. This is the
standard pattern for integrating any third-party API safely.

## Learning curve — modules

Each module = one concept explained + one hands-on session + one commit.
We go in order; nothing here is optional filler.

0. **Environment & how the web works** — HTTP request/response, client vs.
   server, terminal basics, git, Node/npm. *Deliverable: dev environment
   ready, project scaffolded.*
1. **Backend foundations** — Express server, routing, JSON responses, REST
   conventions (GET/POST/PUT/DELETE), auto-reload. *Deliverable:
   `GET /api/health` endpoint, running locally.*
2. **Database** — relational modeling, Prisma schema, migrations, CRUD.
   *Deliverable: `User` and `Itinerary` models, CRUD endpoints (no auth yet).*
3. **Auth** — password hashing, JWT issuing/verifying, middleware,
   protected routes. *Deliverable: `/api/signup`, `/api/login`, a protected
   `/api/itineraries`.*
4. **Calling a third-party API** — secrets/env vars, the Anthropic SDK,
   prompt design, requesting structured JSON output, error handling,
   timeouts. *Deliverable: `/api/generate-itinerary` calls Claude and
   returns structured trip data.*
5. **Tying it together (backend)** — save Claude's output to the DB, scoped
   to the logged-in user; list/get/delete. *Deliverable: full
   generate → save → retrieve flow, testable via curl.*
6. **Frontend foundations** — components, JSX, props/state, hooks
   (`useState`/`useEffect`). *Deliverable: static itinerary form UI.*
7. **Frontend ↔ backend** — fetch calls, loading/error states, React Router
   pages (Home, Generate, My Trips, Trip Detail). *Deliverable: working
   generate-and-view flow, end to end.*
8. **Frontend auth** — signup/login pages, storing/using the JWT, protected
   routes, logout. *Deliverable: full auth flow in the UI.*
9. **Polish** — form validation, empty/error/loading states, a real styling
   pass, responsive layout.
10. **Testing** — backend unit/integration tests (Vitest + supertest), one
    frontend component test.
11. **Deployment** — env var management, deploying backend + frontend to
    Render, production DB, CORS.
12. **Stretch goals** (pick any, later): stream Claude's response
    token-by-token, PDF export, "favorite" trips, rate-limit the AI
    endpoint, cache identical requests, swap SQLite → Postgres.

## How each session works

- I explain the concept in plain terms first — the *why*, not just the *how*.
- We write the code together, live, right in this repo.
- Each module ends in a real, working commit you can look back on later.
- Ask me to slow down, go deeper, or skip ahead any time — this is your pace.
- Say "quiz me" whenever you want a comprehension check before moving on.

## Prerequisites

- A free Anthropic API key from console.anthropic.com — we'll wire this up
  in Module 4, not before.
- That's it — Node.js is already installed in this environment.

## Progress

- [x] Module 0 — environment & scaffold
- [ ] Module 1 — first Express endpoint
- [ ] Module 2 — database
- [ ] Module 3 — auth
- [ ] Module 4 — Claude API integration
- [ ] Module 5 — backend feature complete
- [ ] Module 6 — frontend foundations
- [ ] Module 7 — frontend wired to backend
- [ ] Module 8 — frontend auth
- [ ] Module 9 — polish
- [ ] Module 10 — testing
- [ ] Module 11 — deployment
