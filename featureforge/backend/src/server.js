// Module 1: your first API endpoint. Module 2-3: FeatureForge's core loop —
// plan a change with Claude, show a diff, apply it on request.
//
// A web server's job is simple: listen for HTTP requests, and send back
// HTTP responses. Express is a library that makes that easy — you register
// a "route" (a method + a path) and a function to handle it.
import "dotenv/config";
import express from "express";
import { featuresRouter } from "./routes/features.js";

const app = express();
const PORT = process.env.PORT || 4000;

// Without this, req.body would be undefined for JSON requests — Express
// doesn't parse the request body by default, you opt in per format.
app.use(express.json());

// GET /api/health — a "health check" endpoint. Nearly every real API has
// one: it's how you (or a hosting platform, or a monitoring tool) confirm
// the server is up without doing anything meaningful.
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.use("/api/features", featuresRouter);

app.listen(PORT, () => {
  console.log(`FeatureForge backend listening on http://localhost:${PORT}`);
});
