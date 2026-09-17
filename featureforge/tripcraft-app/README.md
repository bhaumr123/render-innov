# tripcraft-app

This is the **output** of FeatureForge, not something we hand-write. Every file
that eventually appears here — the Express backend, the React frontend, the
database schema — is created by describing a feature to FeatureForge
(`POST /api/features/plan`, review the diff, then `POST /api/features/apply`)
and letting it build the app.

## Backend

A scaffolded Express backend lives in `backend/`.

### Setup

```bash
cd backend
npm install
npm start
```

The server listens on port `3001` by default (override with the `PORT`
environment variable).

### Health check

`GET /api/health` returns a JSON payload confirming the service is running:

```json
{
  "status": "ok",
  "uptime": 12.34,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```
