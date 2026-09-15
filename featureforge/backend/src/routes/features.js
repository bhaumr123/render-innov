import { randomUUID } from "crypto";
import express from "express";
import { planFeature } from "../lib/claudeClient.js";
import { unifiedDiff } from "../lib/diffUtil.js";
import { buildContext, readFile, writeFile, deleteFile } from "../lib/targetProject.js";

export const featuresRouter = express.Router();

// In-memory store of plans awaiting a decision. A real app would persist
// this (that's Module 4 — database) so history survives a server restart;
// for now, keeping it in memory is honest about what stage we're at.
const pendingPlans = new Map();

// POST /api/features/plan  { description: string }
// Asks Claude to design the change, computes a diff per file against what's
// currently on disk, and returns the plan WITHOUT touching tripcraft-app/.
featuresRouter.post("/plan", async (req, res) => {
  const { description } = req.body || {};
  if (!description || typeof description !== "string" || !description.trim()) {
    return res.status(400).json({ error: "description is required" });
  }

  try {
    const context = buildContext();
    const plan = await planFeature(description, context);

    const files = (plan.files || []).map((f) => {
      const before = readFile(f.path);
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
    pendingPlans.set(planId, { description, summary: plan.summary, files });

    // Don't send raw `content` back to the client for the review step —
    // the diff already shows the change; sending full content too just
    // bloats the response. It stays server-side, keyed by planId, until
    // /apply asks for it.
    res.json({
      planId,
      summary: plan.summary,
      files: files.map(({ content, ...rest }) => rest),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/features/apply  { planId: string }
// Writes a previously-planned change to tripcraft-app/ for real.
featuresRouter.post("/apply", (req, res) => {
  const { planId } = req.body || {};
  const plan = pendingPlans.get(planId);
  if (!plan) {
    return res.status(404).json({ error: "Unknown or expired planId. Run /plan again." });
  }

  const applied = [];
  for (const file of plan.files) {
    if (file.action === "delete") {
      deleteFile(file.path);
    } else {
      writeFile(file.path, file.content);
    }
    applied.push({ path: file.path, action: file.action });
  }

  pendingPlans.delete(planId);
  res.json({ summary: plan.summary, applied });
});
