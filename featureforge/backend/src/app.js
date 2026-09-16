// The Express app itself, separate from "start listening on a port."
// Splitting these matters for one reason: a test can import `app` and
// hand it to supertest, which makes real HTTP requests against it in
// memory — no port to bind, no real network, no risk of colliding with a
// server you already have running locally.
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { featuresRouter } from "./routes/features.js";

export const app = express();

// The frontend (Module 6/7) runs on a different port (Vite's dev server),
// which makes it a different "origin" as far as the browser is concerned —
// without this, the browser blocks the frontend's requests before they
// even reach us. Wide open (no CORS_ORIGIN set) is fine for local dev;
// Module 11 sets CORS_ORIGIN in production so only the real deployed
// frontend can call this API from a browser.
app.use(cors(process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN } : undefined));

// Without this, req.body would be undefined for JSON requests — Express
// doesn't parse the request body by default, you opt in per format.
app.use(express.json());

// GET /api/health — a "health check" endpoint. Nearly every real API has
// one: it's how you (or a hosting platform, or a monitoring tool) confirm
// the server is up without doing anything meaningful.
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/features", featuresRouter);
