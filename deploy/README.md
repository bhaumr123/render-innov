# cPanel Deployment Guide — Innovation Window India

This guide deploys the app to a standard shared cPanel host with:

- **Domain:** `innovationwindowindia.com`
- **Frontend:** React SPA served from `public_html/` (Apache)
- **Backend:** FastAPI served by cPanel's *Setup Python App* (Phusion Passenger, WSGI via `a2wsgi`)
- **Database:** MongoDB Atlas (free tier is fine to start)

> cPanel shared hosting does not run local MongoDB. Use MongoDB Atlas or an equivalent managed Mongo — do **not** try to run `mongod` on cPanel.

---

## 1. Prerequisites

1. cPanel account with:
   - **Setup Python App** available (most Namecheap / Hostinger / A2 Hosting plans have this)
   - **SSH access** (recommended, not mandatory)
2. Free [MongoDB Atlas](https://cloud.mongodb.com) cluster — copy the `mongodb+srv://…` connection string.
3. Razorpay account with LIVE keys (or keep the TEST keys during staging).
4. Domain `innovationwindowindia.com` pointing to the cPanel server (A record from your registrar).

---

## 2. Build the React frontend locally

On your own laptop (not on cPanel):

```bash
cd frontend
cp .env.production.example .env      # then edit REACT_APP_BACKEND_URL
yarn install
yarn build
```

This produces `frontend/build/`. Everything inside that folder is what you will upload.

---

## 3. Upload the frontend to `public_html`

1. Open cPanel → **File Manager** → `public_html/`.
2. Delete any placeholder `index.html` / `cgi-bin` that came with the account.
3. Upload the **contents** of `frontend/build/` (not the folder itself) into `public_html/`.
4. Make sure `.htaccess` (already included in this repo at `frontend/public/.htaccess`) lands in `public_html/.htaccess`. It:
   - Forces HTTPS
   - Rewrites SPA routes to `index.html`
   - Enables gzip + long-term caching for hashed assets

---

## 4. Upload the backend

1. In cPanel → **File Manager**, create a folder outside `public_html`, e.g. `~/innovation_backend/`.
2. Upload the entire `/app/backend/` directory contents into `~/innovation_backend/`. At minimum you need:
   - `server.py`
   - `passenger_wsgi.py`
   - `requirements.txt`
   - `.env` (created from `.env.production.example`)
3. Edit `~/innovation_backend/.env`:
   - Paste the Atlas `MONGO_URL`
   - Generate a fresh `JWT_SECRET` (`python -c "import secrets; print(secrets.token_hex(32))"`)
   - Set `CORS_ORIGINS="https://innovationwindowindia.com,https://www.innovationwindowindia.com"`
   - Paste your Razorpay LIVE keys and `RAZORPAY_WEBHOOK_SECRET`

---

## 5. Create the Python App in cPanel

cPanel → **Setup Python App** → **Create Application**:

| Field | Value |
|---|---|
| Python version | 3.11 (or the highest 3.11+ available) |
| Application root | `innovation_backend` |
| Application URL | `innovationwindowindia.com/api` |
| Application startup file | `passenger_wsgi.py` |
| Application Entry point | `application` |

Click **Create**. cPanel will print a command like:

```
source /home/<user>/virtualenv/innovation_backend/3.11/bin/activate && cd /home/<user>/innovation_backend
```

Run that in **Terminal** (cPanel → Terminal), then:

```bash
pip install -r requirements.txt
```

Finally back on the *Setup Python App* page click **Restart**.

---

## 6. Wire the API subpath in Apache

cPanel's Python App already exposes the FastAPI at `https://innovationwindowindia.com/api/…` because we mounted it at `/api`. If you chose a different **Application URL**, update:

- `frontend/.env.production` → `REACT_APP_BACKEND_URL=https://innovationwindowindia.com` (no trailing slash — the frontend always prefixes `/api`)
- Rebuild + reupload the SPA.

If you prefer a separate subdomain (e.g. `api.innovationwindowindia.com`):

1. Create a subdomain pointing to `innovation_backend` in cPanel.
2. Set **Application URL** to `api.innovationwindowindia.com/`.
3. Change `REACT_APP_BACKEND_URL=https://api.innovationwindowindia.com` and rebuild.

---

## 7. Razorpay webhook

Razorpay Dashboard → **Webhooks** → Add:

- URL: `https://innovationwindowindia.com/api/webhooks/razorpay`
- Secret: same value as `RAZORPAY_WEBHOOK_SECRET` in `.env`
- Events: `payment.captured`, `payment.failed`

---

## 8. Smoke test

```bash
# Health
curl -s https://innovationwindowindia.com/api/health

# Frontend loads and routes work
curl -sI https://innovationwindowindia.com/            # 200
curl -sI https://innovationwindowindia.com/products    # 200 (served by index.html)
```

Login with the admin credentials from `.env`, place a Razorpay test order, then rotate the admin password.

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `500 Internal Server Error` on `/api/...` | cPanel → *Setup Python App* → **Log Files**. Usually a missing env var or the venv did not pick up `requirements.txt`. Re-run `pip install -r requirements.txt` and **Restart**. |
| React routes return 404 on refresh | `.htaccess` missing from `public_html/`. Re-upload it (dotfiles are hidden — enable "Show hidden" in File Manager). |
| CORS blocked in browser | `CORS_ORIGINS` in backend `.env` must include the exact protocol + host (`https://innovationwindowindia.com`). Restart the Python App after editing. |
| Mongo connection timeouts | Whitelist the cPanel server's outbound IP in Atlas → Network Access, or allow `0.0.0.0/0` for testing. |
| Razorpay webhook shows `signature mismatch` | The `RAZORPAY_WEBHOOK_SECRET` in `.env` must exactly match the value entered in the Razorpay dashboard. |

---

## 10. Files added by this deployment prep

- `backend/passenger_wsgi.py` — WSGI/ASGI bridge for Passenger
- `backend/.env.production.example` — template for the production `.env`
- `backend/requirements.txt` — now includes `a2wsgi`
- `frontend/public/.htaccess` — Apache rewrite + caching rules
- `frontend/.env.production.example` — template for build-time env
- `CPANEL_DEPLOYMENT.md` — this file
