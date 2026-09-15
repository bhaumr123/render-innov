// Module 1: your first API endpoint.
//
// A web server's job is simple: listen for HTTP requests, and send back
// HTTP responses. Express is a library that makes that easy — you register
// a "route" (a method + a path) and a function to handle it.
import express from "express";

const app = express();
const PORT = process.env.PORT || 4000;

// GET /api/health — a "health check" endpoint. Nearly every real API has
// one: it's how you (or a hosting platform, or a monitoring tool) confirm
// the server is up without doing anything meaningful.
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`TripCraft backend listening on http://localhost:${PORT}`);
});
