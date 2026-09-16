# Deploying FeatureForge to Render

This ships with its own Render Blueprint (`featureforge/render.yaml`),
separate from the repo's root `render.yaml` — that one deploys the actual
live render-innov app; applying this one doesn't touch it.

| Service | Type | Free tier |
|---|---|---|
| `featureforge-backend`  | Node/Express web service | Yes (spins down after 15 min idle, ~30s cold-start) |
| `featureforge-frontend` | Static React SPA         | Yes, no sleep |

## Read this first: the SQLite limitation

`FeatureRequest` history and user accounts live in a SQLite file
(`prisma/dev.db`) on the backend service's own disk. Render's free/standard
web services have an **ephemeral** filesystem — everything on disk resets
on every redeploy, every time the service restarts after spinning down, and
whenever it's scaled to more than one instance. In practice, on Render's
free tier: your account and history will periodically vanish.

Two ways to fix this for real, neither implemented here:
1. Add a [Render persistent disk](https://render.com/docs/disks) to the
   backend service (paid) and point `DATABASE_URL` at a file inside it.
2. Swap SQLite for a real Postgres database — Render has managed Postgres,
   and this is genuinely the better production answer. It's Module 12's
   "swap SQLite → Postgres" stretch goal in `ROADMAP.md`, not done yet.

The same ephemeral-disk fact also applies to `tripcraft-app/` and
`k8s-deploy/` — whatever FeatureForge builds for you on a deployed instance
is not durable storage. This deployment is genuinely useful for trying
FeatureForge out from anywhere, not yet a place to keep permanent work —
treat anything it builds there as disposable until you commit it back to
git yourself.

## Prerequisites

1. **Anthropic API key** — from [console.anthropic.com](https://console.anthropic.com).
2. **GitHub repo** — this branch, pushed (it already is).

## Step 1 — Sign up for Render

Go to [render.com](https://render.com) → **Get Started for Free** → sign in
with GitHub. Grant access to this repo.

## Step 2 — Deploy the Blueprint

1. In Render, click **New +** → **Blueprint**.
2. Pick this repo and branch. Render scans for `render.yaml` at the repo
   root — since this one lives at `featureforge/render.yaml`, point Render
   at that path when it asks (Blueprint settings → "Blueprint YAML
   location").
3. Click **Apply**. Render creates both services.

## Step 3 — Fill in the secret

For `featureforge-backend`, Render prompts for the one env var marked
`sync: false`:

| Env var | Value |
|---|---|
| `ANTHROPIC_API_KEY` | From console.anthropic.com → API Keys. Without it, every `/plan` call fails with a clear error — same behavior as local dev. |

`JWT_SECRET` auto-generates on first deploy — no action needed.

Click **Save Changes**. The build kicks off automatically.

## Step 4 — Watch the build

- **featureforge-backend**: `npm install`, `prisma generate`,
  `prisma migrate deploy` (creates the tables fresh — see the SQLite note
  above), then starts. First deploy takes 1-2 min.
- **featureforge-frontend**: `npm install && npm run build`, uploaded to
  Render's CDN. Takes 1-2 min.

Both should turn green in the dashboard.

## Step 5 — Smoke test

Render assigns URLs like `https://featureforge-backend.onrender.com` and
`https://featureforge-frontend.onrender.com` (these are also what
`render.yaml` assumes for `CORS_ORIGIN` and `VITE_API_BASE` — if you rename
the services, update both to match, or the two won't be able to talk to
each other).

```bash
curl https://featureforge-backend.onrender.com/api/health
# → {"status":"ok","time":"..."}
```

Open the frontend URL, sign up, describe a feature, plan it, review the
diff, apply it. Same flow as local dev, against a real deployed backend.

## Custom domain (optional)

Same pattern as the main app: `featureforge-frontend` service → **Settings
→ Custom Domains** → add your domain, then create the CNAME record Render
shows you at your DNS registrar.
