# Innovation Window India — cPanel deployment package

This folder is a ready-to-upload cPanel bundle. It contains the production build of the site and everything cPanel needs to run the backend.

```
deploy/
├── public_html/            <- upload the CONTENTS of this to your cPanel public_html/
│   ├── .htaccess           (Apache rewrites for React Router + HTTPS + gzip)
│   ├── index.html
│   ├── asset-manifest.json
│   └── static/             (hashed JS/CSS/media)
├── innovation_backend/     <- upload this whole folder OUTSIDE public_html/ (e.g. ~/innovation_backend/)
│   ├── passenger_wsgi.py   (WSGI/ASGI bridge — cPanel entry point)
│   ├── server.py           (FastAPI app)
│   ├── requirements.txt    (Python deps)
│   └── .env.example        (rename to .env after filling values)
└── README.md               (this file)
```

The frontend has been built with `REACT_APP_BACKEND_URL=https://innovationwindowindia.com` — so as long as your backend is served at `https://innovationwindowindia.com/api/...`, no rebuild is needed.

---

## Prerequisites

Do these once before uploading:

1. **Point the domain to cPanel** — add an `A` record for `innovationwindowindia.com` (and `www.innovationwindowindia.com`) at your registrar to the cPanel server IP.
2. **Install an SSL certificate** — cPanel → *SSL/TLS Status* → *Run AutoSSL*. Wait until the padlock icon is green.
3. **Provision MongoDB Atlas** — cPanel shared hosting does not run Mongo locally.
   - Sign up at [cloud.mongodb.com](https://cloud.mongodb.com)
   - Create a free **M0** cluster in the region closest to your cPanel server
   - **Database Access** → create a DB user + password
   - **Network Access** → add your cPanel outbound IP (or `0.0.0.0/0` to start)
   - **Connect → Drivers → Python** → copy the `mongodb+srv://...` connection string
4. **Razorpay keys** — either keep the TEST keys during staging or generate LIVE keys once KYC is approved.

---

## Step 1 — Upload the frontend

1. Open cPanel → **File Manager** → navigate into `public_html/`.
2. Delete any placeholder files that came with the account (`index.html`, `cgi-bin/` may be left as-is if you don't use CGI).
3. Upload the **contents** of the local `deploy/public_html/` folder (not the folder itself). Dotfiles like `.htaccess` must land in `public_html/.htaccess`. Enable **Settings → Show Hidden Files** in File Manager if needed.
4. Right-click `.htaccess` → **Permissions** → confirm it is `644`.

Sanity check by visiting `https://innovationwindowindia.com/` — you should see the site (API calls will fail until Step 2 finishes).

---

## Step 2 — Upload the backend

1. In cPanel → **File Manager**, click **Home** (⌂). Create a new folder: `innovation_backend`. This must be **outside** `public_html/`.
2. Upload the **contents** of the local `deploy/innovation_backend/` folder into that directory.
3. Rename `.env.example` → `.env` and edit it. See Step 3 for values.

Your file tree should look like:

```
/home/YOUR_USER/
├── innovation_backend/
│   ├── .env
│   ├── passenger_wsgi.py
│   ├── requirements.txt
│   └── server.py
└── public_html/
    ├── .htaccess
    ├── index.html
    └── static/...
```

---

## Step 3 — Fill in `innovation_backend/.env`

Open `.env` and set every value. Reference:

```dotenv
MONGO_URL="mongodb+srv://USER:PASS@CLUSTER.mongodb.net/?retryWrites=true&w=majority"
DB_NAME="innovation_window_india"

CORS_ORIGINS="https://innovationwindowindia.com,https://www.innovationwindowindia.com"
FRONTEND_URL="https://innovationwindowindia.com"

JWT_SECRET="<paste the output of `python -c 'import secrets; print(secrets.token_hex(32))'`>"

ADMIN_EMAIL="admin@innovationwindowindia.com"
ADMIN_PASSWORD="<a strong password, change after first login>"

FLAT_SHIPPING_FEE="49"
FREE_SHIPPING_THRESHOLD="799"

RAZORPAY_KEY_ID="rzp_live_XXXXXXXXXXXXXXXX"
RAZORPAY_KEY_SECRET="XXXXXXXXXXXXXXXXXXXXXXXX"
RAZORPAY_WEBHOOK_SECRET="XXXXXXXXXXXXXXXXXXXXXXXX"

COOKIE_SECURE="true"
```

> Never commit `.env` to git. Keep it inside cPanel only.

---

## Step 4 — Create the Python App

cPanel → **Setup Python App** → **Create Application**:

| Field                     | Value                                            |
|---------------------------|--------------------------------------------------|
| Python version            | 3.11 (or highest 3.10+ available)                |
| Application root          | `innovation_backend`                             |
| Application URL           | `innovationwindowindia.com/api`                  |
| Application startup file  | `passenger_wsgi.py`                              |
| Application Entry point   | `application`                                    |

Click **Create**. cPanel prints a `source .../activate && cd ...` command. Open **cPanel → Terminal**, paste that command, then run:

```bash
pip install -r requirements.txt
```

Go back to *Setup Python App* → click **Restart**.

---

## Step 5 — Configure the Razorpay webhook

Razorpay Dashboard → **Settings → Webhooks → + Add New Webhook**:

- **URL:** `https://innovationwindowindia.com/api/webhooks/razorpay`
- **Secret:** the exact value of `RAZORPAY_WEBHOOK_SECRET` in your `.env`
- **Active events:** `payment.captured`, `payment.failed`

---

## Step 6 — Smoke test

Run each of these — you should see JSON responses, not HTML error pages.

```bash
curl -s https://innovationwindowindia.com/api/
# → {"message":"Innovation Window India API","version":"1.0"}

curl -s https://innovationwindowindia.com/api/products | head -c 300
# → {"items":[...]}
```

Then open `https://innovationwindowindia.com/` in a browser:

1. Products should load from the API.
2. Register a new user, add an item to cart, checkout with the Razorpay test card `4111 1111 1111 1111` (OTP `1234`).
3. Log in as admin with the email + password from `.env`. Rotate the admin password immediately.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `500 Internal Server Error` on `/api/...` | cPanel → *Setup Python App* → **Log Files**. Usually a missing env var or the venv missed `pip install`. Re-run `pip install -r requirements.txt` and **Restart**. |
| React routes return 404 on refresh | `.htaccess` missing or has wrong permissions. Re-upload it (enable "Show hidden" in File Manager) and set to `644`. |
| CORS error in browser console | `CORS_ORIGINS` in `.env` must include the exact scheme + host, no trailing slash. Restart the Python App after edits. |
| Mongo `ServerSelectionTimeoutError` | Whitelist the cPanel outbound IP in Atlas → *Network Access*, or allow `0.0.0.0/0` for testing. |
| Razorpay webhook returns `signature mismatch` | `RAZORPAY_WEBHOOK_SECRET` in `.env` must exactly match the Razorpay dashboard value. |
| Site loads but API 502s | Passenger app crashed. Check *Setup Python App → Log Files*. Common cause: `pip install` never ran inside the venv, or a package failed to compile. |

---

## Redeploying

**Frontend-only change** (React code, styling): rebuild locally with `REACT_APP_BACKEND_URL=https://innovationwindowindia.com yarn build`, then re-upload the contents of `build/` to `public_html/`.

**Backend-only change** (`server.py`): upload the new file, then click **Restart** in *Setup Python App*.

**Dependency change** (`requirements.txt`): upload the new file, open cPanel → Terminal → activate the venv → `pip install -r requirements.txt` → **Restart** the app.
