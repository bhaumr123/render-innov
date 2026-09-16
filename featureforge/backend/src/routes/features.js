import express from "express";
import { planFeature } from "../lib/claudeClient.js";
import { unifiedDiff } from "../lib/diffUtil.js";
import { requireAuth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import {
  STREAMS,
  isValidStream,
  buildContext,
  buildReferenceContext,
  looksLikeDuplicatedRoot,
  readFile,
  writeFile,
  deleteFile,
} from "../lib/targetProject.js";

export const featuresRouter = express.Router();

// Every route below needs a logged-in user — a plan and its diff are now
// tied to whoever asked for them (userId on FeatureRequest), so there has
// to be a "whoever" before any of this runs.
featuresRouter.use(requireAuth);

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

// GET /api/features/history — every plan this user has ever made, most
// recent first. This is the entire reason Module 4 exists: before it, this
// information lived in a Map that emptied itself on every restart.
featuresRouter.get("/history", async (req, res) => {
  const requests = await prisma.featureRequest.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    requests: requests.map((r) => ({
      id: r.id,
      stream: r.stream,
      description: r.description,
      summary: r.summary,
      status: r.status,
      fileCount: JSON.parse(r.filesJson).length,
      createdAt: r.createdAt,
      appliedAt: r.appliedAt,
    })),
  });
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
// file against what's currently on disk, saves the plan (status:
// "planned"), and returns it WITHOUT touching anything in the target dir.
featuresRouter.post("/:stream/plan", requireValidStream, async (req, res) => {
  const { stream } = req.params;
  const { description } = req.body || {};
  if (!description || typeof description !== "string" || !description.trim()) {
    return res.status(400).json({ error: "description is required" });
  }

  try {
    const context = buildContext(stream);
    const referenceContext = buildReferenceContext(stream);
    const plan = await planFeature(stream, description, context, referenceContext);

    // Our tool schema marks `summary` required, but forced tool-use only
    // guarantees Claude's reply matches the schema's *shape* — it doesn't
    // guarantee every required field is actually filled in. Seen this
    // happen live: a real response came back with `files` populated and
    // no `summary` at all. Never trust an LLM's structured output as fully
    // as you'd trust a type system; validate/default the way you would
    // for any other untrusted input.
    const summary = plan.summary || "(Claude didn't provide a summary for this plan.)";

    const badPaths = (plan.files || [])
      .map((f) => f.path)
      .filter((p) => looksLikeDuplicatedRoot(stream, p));
    if (badPaths.length) {
      return res.status(502).json({
        error:
          `Claude prefixed ${badPaths.length} path(s) with the "${stream}" ` +
          `stream's own root directory name (e.g. "${badPaths[0]}") — that ` +
          "would double-nest on apply. Rejecting this plan; try /plan again.",
      });
    }

    const files = (plan.files || []).map((f) => {
      const before = readFile(stream, f.path);
      const after = f.action === "delete" ? "" : f.content ?? "";
      return {
        path: f.path,
        action: f.action,
        explanation: f.explanation,
        diff: unifiedDiff(f.path, before, after),
        content: after, // kept in the DB row so /apply doesn't need Claude again
      };
    });

    const saved = await prisma.featureRequest.create({
      data: {
        userId: req.user.id,
        stream,
        description,
        summary,
        filesJson: JSON.stringify(files),
        status: "planned",
      },
    });

    // Don't send raw `content` back to the client for the review step —
    // the diff already shows the change; sending full content too just
    // bloats the response. It stays in the DB row until /apply asks for it.
    res.json({
      planId: saved.id,
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
// real, then marks that FeatureRequest row "applied". Scoped to req.user.id
// so one user can never apply another's plan by guessing an id.
featuresRouter.post("/:stream/apply", requireValidStream, async (req, res) => {
  const { stream } = req.params;
  const { planId } = req.body || {};

  const saved = await prisma.featureRequest.findFirst({
    where: { id: planId, userId: req.user.id, stream },
  });
  if (!saved) {
    return res.status(404).json({
      error: "Unknown planId for this stream and user. Run /plan again.",
    });
  }
  if (saved.status === "applied") {
    return res.status(409).json({ error: "This plan was already applied." });
  }

  const files = JSON.parse(saved.filesJson);
  const applied = [];
  for (const file of files) {
    if (file.action === "delete") {
      deleteFile(stream, file.path);
    } else {
      writeFile(stream, file.path, file.content);
    }
    applied.push({ path: file.path, action: file.action });
  }

  await prisma.featureRequest.update({
    where: { id: saved.id },
    data: { status: "applied", appliedAt: new Date() },
  });

  res.json({ stream, summary: saved.summary, applied });
});
