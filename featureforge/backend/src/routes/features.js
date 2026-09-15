import { randomUUID } from "crypto";
import express from "express";
import { planFeature } from "../lib/claudeClient.js";
import { unifiedDiff } from "../lib/diffUtil.js";
import {
  STREAMS,
  isValidStream,
  buildContext,
  readFile,
  writeFile,
  deleteFile,
} from "../lib/targetProject.js";

export const featuresRouter = express.Router();

// In-memory store of plans awaiting a decision. A real app would persist
// this (that's Module 4 — database) so history survives a server restart;
// for now, keeping it in memory is honest about what stage we're at.
const pendingPlans = new Map();

// GET /api/features/streams — lets a client (or you, via curl) discover
// what streams exist without hardcoding them on the frontend.
featuresRouter.get("/streams", (req, res) => {
  const streams = Object.entries(STREAMS).map(([id, s]) => ({
    id,
    label: s.label,
    description: s.description,
  }));
  res.json({ streams });
});

function requireValidStream(req, res, next) {
  const { stream } = req.params;
  if (!isValidStream(stream)) {
    return res.status(404).json({
      error: `Unknown stream "${stream}". Valid streams: ${Object.keys(STREAMS).join(", ")}`,
    });
  }
  next();
}

// POST /api/features/:stream/plan  { description: string }
// Asks Claude to design the change for that stream, computes a diff per
// file against what's currently on disk, and returns the plan WITHOUT
// touching anything on disk.
featuresRouter.post("/:stream/plan", requireValidStream, async (req, res) => {
  const { stream } = req.params;
  const { description } = req.body || {};
  if (!description || typeof description !== "string" || !description.trim()) {
    return res.status(400).json({ error: "description is required" });
  }

  try {
    const context = buildContext(stream);
    const plan = await planFeature(stream, description, context);

    // Our tool schema marks `summary` required, but forced tool-use only
    // guarantees Claude's reply matches the schema's *shape* — it doesn't
    // guarantee every required field is actually filled in. Seen this
    // happen live: a real response came back with `files` populated and
    // no `summary` at all. Never trust an LLM's structured output as fully
    // as you'd trust a type system; validate/default the way you would
    // for any other untrusted input.
    const summary = plan.summary || "(Claude didn't provide a summary for this plan.)";

    const files = (plan.files || []).map((f) => {
      const before = readFile(stream, f.path);
      const after = f.action === "delete" ? "" : f.content ?? "";
      return {
        path: f.path,
        action: f.action,
        explanation: f.explanation,
        diff: unifiedDiff(f.path, before, after),
        content: after, // kept server-side so /apply doesn't need Claude again
      };
    });

    const planId = randomUUID();
    pendingPlans.set(planId, { stream, description, summary, files });

    // Don't send raw `content` back to the client for the review step —
    // the diff already shows the change; sending full content too just
    // bloats the response. It stays server-side, keyed by planId, until
    // /apply asks for it.
    res.json({
      planId,
      stream,
      summary,
      files: files.map(({ content, ...rest }) => rest),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/features/:stream/apply  { planId: string }
// Writes a previously-planned change to that stream's target directory for
// real. The planId must have come from a /plan call for this same stream —
// that's what stops a k8s plan from accidentally landing in tripcraft-app/.
featuresRouter.post("/:stream/apply", requireValidStream, (req, res) => {
  const { stream } = req.params;
  const { planId } = req.body || {};
  const plan = pendingPlans.get(planId);
  if (!plan || plan.stream !== stream) {
    return res.status(404).json({
      error: "Unknown or expired planId for this stream. Run /plan again.",
    });
  }

  const applied = [];
  for (const file of plan.files) {
    if (file.action === "delete") {
      deleteFile(stream, file.path);
    } else {
      writeFile(stream, file.path, file.content);
    }
    applied.push({ path: file.path, action: file.action });
  }

  pendingPlans.delete(planId);
  res.json({ stream, summary: plan.summary, applied });
});
