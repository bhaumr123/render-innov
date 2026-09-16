import express from "express";
import { planFeature, planFeatureStream } from "../lib/llmClient.js";
import { unifiedDiff } from "../lib/diffUtil.js";
import { requireAuth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import {
  isValidStream,
  listAllStreams,
  registerCustomStream,
  InvalidStreamError,
  buildContext,
  buildReferenceContext,
  getStreamPromptSource,
  looksLikeDuplicatedRoot,
  readFile,
  writeFile,
  deleteFile,
} from "../lib/targetProject.js";

export const featuresRouter = express.Router();

// Feeds the self-improvement agent's memory (KnownIssue). Only genuinely
// unexpected failures count — not our own deliberately-thrown domain
// errors (they already have an err.status and proper handling elsewhere),
// and not "you haven't configured X yet" messages, which are operator
// setup, not a bug in the code. Never lets a logging failure break the
// actual response path.
function isConfigError(err) {
  return /is not set/i.test(err.message);
}

async function maybeLogFailure(area, err) {
  if (err.status || isConfigError(err)) return;
  try {
    await prisma.knownIssue.create({
      data: {
        title: `Unexpected error in ${area}: ${err.message.slice(0, 120)}`,
        description: err.stack || err.message,
        area,
        status: "open",
      },
    });
  } catch {
    // Logging the failure is a nice-to-have, not worth failing on top of
    // the original failure.
  }
}

// Every route below needs a logged-in user — a plan and its diff are now
// tied to whoever asked for them (userId on FeatureRequest), so there has
// to be a "whoever" before any of this runs.
featuresRouter.use(requireAuth);

// GET /api/features/streams — lets a client (or you, via curl) discover
// what streams exist without hardcoding them on the frontend. Includes
// both built-in streams and anything registered at runtime.
featuresRouter.get("/streams", (req, res) => {
  res.json({ streams: listAllStreams() });
});

// POST /api/features/streams  { slug, label, description, systemPrompt }
// Module 12: registers a brand-new target project beyond the two built-in
// streams — its own directory under featureforge/custom/, usable
// immediately at /api/features/:slug/plan and /apply.
featuresRouter.post("/streams", async (req, res) => {
  const { slug, label, description, systemPrompt } = req.body || {};
  try {
    const stream = await registerCustomStream({
      slug,
      label,
      description,
      systemPrompt,
      userId: req.user.id,
    });
    res.status(201).json({ stream });
  } catch (err) {
    if (err instanceof InvalidStreamError) {
      return res.status(400).json({ error: err.message });
    }
    await maybeLogFailure("streams", err);
    res.status(500).json({ error: err.message });
  }
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
      error: `Unknown stream "${stream}". GET /api/features/streams lists the valid ones.`,
    });
  }
  next();
}

// Shared by the plain and streaming /plan endpoints below — everything
// except *how the response is delivered* is identical: ask Claude, guard
// against a couple of real failure modes we've hit live, compute diffs,
// save the plan. onDelta, if given, gets each raw JSON fragment as
// Claude's tool-call input streams in (see planFeatureStream's own
// comment for why those fragments aren't parseable on their own).
async function runPlan(stream, description, userId, { onDelta } = {}) {
  const context = buildContext(stream);
  const referenceContext = buildReferenceContext(stream);
  const promptSource = getStreamPromptSource(stream);

  const plan = onDelta
    ? await planFeatureStream(promptSource, description, context, referenceContext, onDelta)
    : await planFeature(promptSource, description, context, referenceContext);

  // Our tool schema marks `summary` required, but forced tool-use only
  // guarantees Claude's reply matches the schema's *shape* — it doesn't
  // guarantee every required field is actually filled in. Seen this
  // happen live: a real response came back with `files` populated and no
  // `summary` at all. Never trust an LLM's structured output as fully as
  // you'd trust a type system; validate/default the way you would for any
  // other untrusted input.
  const summary = plan.summary || "(Claude didn't provide a summary for this plan.)";

  // Seen live on a large multi-page request (a "shop engine" site: 5 pages
  // + real cart JS): the tool call's JSON got cut off in a way that left
  // `files` as a non-array truthy value instead of cleanly missing or
  // empty — `(plan.files || [])` doesn't catch that, since a truthy value
  // skips the fallback, and `.map` on it throws a raw TypeError instead of
  // a clean response. Same family of bug as the missing-summary case
  // above: forced tool-use guarantees shape, not that a large response
  // actually finished cleanly.
  if (plan.files !== undefined && !Array.isArray(plan.files)) {
    const err = new Error(
      "Claude's response for this plan looked truncated or malformed (`files` wasn't a " +
        "list). This tends to happen on requests that need a lot of output, like a multi-" +
        "page site — try again, or split the request into smaller pieces."
    );
    err.status = 502;
    throw err;
  }

  const badPaths = (plan.files || [])
    .map((f) => f.path)
    .filter((p) => looksLikeDuplicatedRoot(stream, p));
  if (badPaths.length) {
    const err = new Error(
      `Claude prefixed ${badPaths.length} path(s) with the "${stream}" stream's own ` +
        `root directory name (e.g. "${badPaths[0]}") — that would double-nest on ` +
        "apply. Rejecting this plan; try /plan again."
    );
    err.status = 502;
    throw err;
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
      userId,
      stream,
      description,
      summary,
      filesJson: JSON.stringify(files),
      status: "planned",
    },
  });

  // Don't send raw `content` back to the client for the review step — the
  // diff already shows the change; sending full content too just bloats
  // the response. It stays in the DB row until /apply asks for it.
  return {
    planId: saved.id,
    stream,
    summary,
    files: files.map(({ content, ...rest }) => rest),
  };
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
    const result = await runPlan(stream, description, req.user.id);
    res.json(result);
  } catch (err) {
    await maybeLogFailure("features-api-plan", err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/features/:stream/plan/stream  { description: string }
// Module 12: the same thing as /plan, but delivered as Server-Sent Events
// so the frontend can show Claude "typing" the plan in real time instead
// of a blank spinner. Not a native EventSource (that's GET-only) — the
// frontend reads this with fetch()'s streaming response body instead.
featuresRouter.post("/:stream/plan/stream", requireValidStream, async (req, res) => {
  const { stream } = req.params;
  const { description } = req.body || {};
  if (!description || typeof description !== "string" || !description.trim()) {
    return res.status(400).json({ error: "description is required" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    const result = await runPlan(stream, description, req.user.id, {
      onDelta: (text) => res.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`),
    });
    res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
  } catch (err) {
    await maybeLogFailure("features-api-plan-stream", err);
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

// POST /api/features/:stream/apply  { planId: string }
// Writes a previously-planned change to that stream's target directory for
// real, then marks that FeatureRequest row "applied". Scoped to req.user.id
// so one user can never apply another's plan by guessing an id.
featuresRouter.post("/:stream/apply", requireValidStream, async (req, res) => {
  const { stream } = req.params;
  const { planId } = req.body || {};

  try {
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
  } catch (err) {
    // Found while adding this route's first try/catch: it had none before
    // — a thrown error here (a bad filesJson row, a disk write failure)
    // would have fallen through to Express's bare default error handler
    // instead of a clean JSON response. Logged as its own KnownIssue.
    await maybeLogFailure("features-api-apply", err);
    res.status(err.status || 500).json({ error: err.message });
  }
});
