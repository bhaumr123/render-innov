// Module 12: the human-facing side of the self-improvement loop — trigger
// a run on demand, and see what it's found and proposed so far. Requires
// login like every other API route here; there's nothing user-specific in
// a KnownIssue or ImprovementRun (they're about FeatureForge itself, not
// any one user's data), but an unauthenticated endpoint that can kick off
// an LLM call on demand is still not something to leave open.
import express from "express";
import { requireAuth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { runSelfImprovement } from "../lib/selfImprove.js";

export const selfImproveRouter = express.Router();

selfImproveRouter.use(requireAuth);

// POST /api/self-improve/run — the "Run now" button. Same graph the
// scheduler calls, just trigger: "manual" instead of "scheduled" so the
// audit trail (GET /runs) shows which is which.
selfImproveRouter.post("/run", async (req, res) => {
  const run = await runSelfImprovement({ trigger: "manual" });
  res.status(run.status === "error" ? 502 : 200).json({ run });
});

// GET /api/self-improve/issues?status=open|reviewed — defaults to open,
// since "what hasn't been looked at yet" is the more useful default view.
selfImproveRouter.get("/issues", async (req, res) => {
  const { status } = req.query;
  const issues = await prisma.knownIssue.findMany({
    where: status ? { status } : undefined,
    orderBy: { discoveredAt: "desc" },
  });
  res.json({ issues });
});

// GET /api/self-improve/runs — the full history of scheduled and manual
// runs, most recent first, so "periodically improve" is something you can
// actually see happening rather than take on faith.
selfImproveRouter.get("/runs", async (req, res) => {
  const runs = await prisma.improvementRun.findMany({
    orderBy: { ranAt: "desc" },
  });
  res.json({ runs: runs.map((r) => ({ ...r, issueIds: JSON.parse(r.issueIds) })) });
});
