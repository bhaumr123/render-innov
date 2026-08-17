# Deploying Innovation Window India to Render

This repo ships with a Render Blueprint (`render.yaml`) that provisions two services:

| Service | Type | Free tier |
|---|---|---|
| `iwi-backend`  | FastAPI web service | Yes (spins down after 15 min idle, ~30 s cold-start) |
| `iwi-frontend` | Static React SPA    | Yes, no sleep |

The frontend is automatically wired to talk to the backend via the internal
Render `host` reference — no manual URL editing required.

---

## Prerequisites (5 min)

1. **MongoDB Atlas** — you already provisioned this. Grab the `mongodb+srv://…` connection string with the DB user's password.
2. **Razorpay keys** — Test keys are fine to start; swap to LIVE once KYC is approved.
3. **Cloudinary account** — free tier is enough. Sign up at [cloudinary.com](https://cloudinary.com), then on your Dashboard copy the **API Environment variable** (it looks like `cloudinary://<key>:<secret>@<cloud_name>`). This is what stores seller product pictures and QR codes durably — without it, uploads fall back to local disk and are wiped on every Render redeploy.
4. **GitHub repo** — push this codebase using the Emergent *Save to GitHub* button in the chat input.

---

## Step 1 — Sign up for Render

Go to [render.com](https://render.com) → **Get Started for Free** → sign in with GitHub. Grant access to the repo you just pushed.

## Step 2 — Deploy the Blueprint

1. In Render, click **New +** → **Blueprint**.
2. Pick your GitHub repo. Render will detect `render.yaml` and preview the two services.
3. Click **Apply**. Render creates both services.

## Step 3 — Fill in the secrets

For `iwi-backend`, Render will prompt for the env vars marked `sync: false`:

| Env var | Value |
|---|---|
| `MONGO_URL` | Your Atlas SRV URI. Whitelist `0.0.0.0/0` in Atlas Network Access so Render can connect. |
| `ADMIN_PASSWORD` | Any strong password — change after first login via **Admin → Profile**. |
| `RAZORPAY_KEY_ID` | From Razorpay Dashboard → Settings → API Keys. **Optional right now** — Razorpay is disabled by default (`RAZORPAY_ENABLED=false` in `render.yaml`); sellers get paid via their own UPI QR code at checkout instead. Skip Razorpay setup entirely unless you want to bring the gateway back. |
| `RAZORPAY_KEY_SECRET` | Same page |
| `RAZORPAY_WEBHOOK_SECRET` | From Razorpay Dashboard → Webhooks (create after deploy) |
| `CLOUDINARY_URL` | The value you copied in Prerequisites step 3. Recommended — without it, seller uploads still work but don't survive a redeploy. |

`JWT_SECRET` auto-generates on first deploy — no action needed.

Click **Save Changes**. The build kicks off automatically.

## Step 4 — Watch the build

- **iwi-backend**: `pip install` + `uvicorn` startup. First deploy takes 2-4 min. Health check hits `/api/`.
- **iwi-frontend**: `yarn install && yarn build` + upload to Render's CDN. Takes 3-5 min.

Both should turn green in the dashboard.

## Step 5 — Smoke test on Render URLs

Render assigns URLs like `https://iwi-backend.onrender.com` and `https://iwi-frontend.onrender.com`. Try:

```bash
curl https://iwi-backend.onrender.com/api/
# → {"message":"Innovation Window India API","version":"1.0"}
```

Open the frontend URL in a browser, register a user, add to cart, check out with mock card. Everything should work.

To confirm the seller flow: go to **Register**, toggle **I'm a seller**, create an account, then on the **Seller dashboard** add a product with a picture and a QR code. If `CLOUDINARY_URL` is set, the uploaded image URL should point to `res.cloudinary.com` — open it directly to confirm it's reachable.

## Step 6 — Point `innovationwindowindia.com` at Render

1. In Render, open the `iwi-frontend` service → **Settings → Custom Domains** → **Add Custom Domain** → `innovationwindowindia.com`. Do the same for `www.innovationwindowindia.com`.
2. Render will show a CNAME target (something like `iwi-frontend.onrender.com`). Add at your DNS registrar:
   - Type: `CNAME` · Name: `www` · Value: (target Render shows) · TTL: `Automatic`
   - Type: `ALIAS`/`ANAME` (or `A` if your registrar doesn't support ALIAS) · Name: `@` · Value: (target Render shows / Render's IPs)
3. Wait 5-30 min for propagation. Render auto-issues an SSL cert.

## Step 7 — Configure the Razorpay webhook (optional — Razorpay is off by default)

Skip this step unless you've deliberately re-enabled Razorpay (`RAZORPAY_ENABLED=true` on `iwi-backend`, plus real keys). While disabled, `/api/webhooks/razorpay` always returns 503.

Razorpay Dashboard → **Settings → Webhooks → Add**:

- URL: `https://innovationwindowindia.com/api/webhooks/razorpay` (or the Render backend URL if you haven't done step 6 yet)
- Secret: same as `RAZORPAY_WEBHOOK_SECRET` in Render
- Events: `payment.captured`, `payment.failed`

---

## Cold-start on free tier

The backend spins down after 15 min of inactivity. The first request after sleep takes ~30 seconds while Render restarts the container. Once you have real traffic this is a non-issue. To eliminate it, upgrade `iwi-backend` to the Starter plan ($7/mo) — the frontend static site stays free.

## Redeploying after code changes

Push to GitHub → Render auto-deploys both services. That's it.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails on `pip install` | Check `backend/requirements.txt` — pin versions if a package broke on update. |
| Backend 502s on Render | Open **iwi-backend → Logs**. Common cause: missing `MONGO_URL` or wrong Atlas password. |
| Frontend loads but API 404s | The `REACT_APP_BACKEND_URL` env var was empty at build time. Trigger a manual **Clear build cache & deploy** on the frontend. |
| CORS error in browser | Update `CORS_ORIGINS` on the backend to include the exact frontend URL (or your custom domain) with scheme. Redeploy. |
| Razorpay webhook mismatch | `RAZORPAY_WEBHOOK_SECRET` in Render must match the value in Razorpay Dashboard exactly. |
| Seller product picture / QR code disappears after a redeploy | `CLOUDINARY_URL` isn't set, so uploads fell back to local disk, which Render's free plan doesn't persist. Set `CLOUDINARY_URL` and re-upload. |
| Seller upload returns "Image upload failed" | Check **iwi-backend → Logs** for the Cloudinary error — usually an invalid or expired `CLOUDINARY_URL`. Re-copy it from the Cloudinary Dashboard. |
