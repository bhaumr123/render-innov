// Everything FeatureForge writes goes through here. Keeping all filesystem
// access in one small module means: (a) it's the only place that needs to
// know where each stream's target directory lives, and (b) it's the one
// place we'd add safety checks (e.g. refusing to write outside that root).
//
// A "stream" is just a named target: a directory FeatureForge is allowed to
// modify, plus a system prompt tuned for what belongs in it. Every stream
// shares this exact same plan -> diff -> apply pipeline; they only differ
// in *where* they write and *what kind* of files Claude is asked to
// produce.
//
// Module 12: streams are no longer just the two hardcoded ones. Built-in
// streams (fullstack, k8s) keep their hand-written system prompts in
// claudeClient.js; custom streams are registered at runtime (POST
// /api/streams), persisted in the Stream table, and cached here in memory
// so every other function in this file can keep treating "look up a
// stream" as a cheap, synchronous operation.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "./prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// backend/src/lib -> backend/src -> backend -> featureforge -> <dir>
function resolveRoot(...segments) {
  return path.resolve(__dirname, "../../../", ...segments);
}

export const STREAMS = {
  fullstack: {
    label: "Full-stack app",
    description: "The TripCraft app itself: backend API, frontend, database.",
    root: resolveRoot("tripcraft-app"),
    // Streams whose files Claude should be able to READ (never write) as
    // reference context. Found the hard way: without this, the k8s stream
    // wrote a Dockerfile CMD and a health-probe path that didn't match
    // what the fullstack stream had actually built — it was guessing.
    referenceStreams: [],
  },
  k8s: {
    label: "Kubernetes deployment",
    description:
      "Deployment manifests for the app: Dockerfiles, Deployments, Services, etc.",
    root: resolveRoot("k8s-deploy"),
    referenceStreams: ["fullstack"],
  },
  mobile: {
    label: "Mobile app (Android)",
    description: "A native Android/Kotlin client for TripCraft.",
    root: resolveRoot("tripcraft-app", "mobile"),
    // Same reason k8s reads fullstack: an Android client calling the real
    // backend needs to match its actual routes, not guess them.
    referenceStreams: ["fullstack"],
  },
  website: {
    label: "Website",
    description:
      "General-purpose websites — landing pages, portfolios, blogs, marketing sites — built as plain HTML/CSS/JS.",
    // Not tied to TripCraft: this stream can hold any number of unrelated
    // site projects, each in its own subdirectory (see the system prompt),
    // so its root is its own top-level directory rather than living under
    // tripcraft-app/.
    root: resolveRoot("websites"),
    referenceStreams: [],
  },
};

const CUSTOM_STREAMS_ROOT = resolveRoot("custom");
const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,40}$/;

// In-memory cache of custom streams, keyed by slug. Populated once at
// startup (loadCustomStreams) and updated on every successful
// registerCustomStream call. This only works correctly for a single
// server process — the same honest limitation every in-memory cache has,
// worth knowing before this ever ran as more than one instance.
const customStreams = new Map();

export async function loadCustomStreams() {
  const rows = await prisma.stream.findMany();
  customStreams.clear();
  for (const row of rows) {
    customStreams.set(row.slug, {
      label: row.label,
      description: row.description,
      systemPrompt: row.systemPrompt,
      root: resolveRoot("custom", row.slug),
      referenceStreams: [],
      custom: true,
    });
  }
}

export function isValidStream(streamId) {
  return Object.prototype.hasOwnProperty.call(STREAMS, streamId) || customStreams.has(streamId);
}

function getStreamConfig(streamId) {
  return STREAMS[streamId] || customStreams.get(streamId);
}

export function listAllStreams() {
  const builtin = Object.entries(STREAMS).map(([id, s]) => ({
    id,
    label: s.label,
    description: s.description,
    custom: false,
  }));
  const custom = Array.from(customStreams.entries()).map(([id, s]) => ({
    id,
    label: s.label,
    description: s.description,
    custom: true,
  }));
  return [...builtin, ...custom];
}

// Registers a new target project: validates the slug, persists it, creates
// its directory with a starter README (same convention as tripcraft-app/
// and k8s-deploy/), and adds it to the in-memory cache so it's usable
// immediately — no restart required.
export async function registerCustomStream({ slug, label, description, systemPrompt, userId }) {
  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) {
    throw new InvalidStreamError(
      "slug must be lowercase letters, digits, and hyphens, starting with a letter (2-41 characters)."
    );
  }
  if (isValidStream(slug)) {
    throw new InvalidStreamError(`"${slug}" is already a stream (built-in or registered).`);
  }
  for (const [field, value] of [
    ["label", label],
    ["description", description],
    ["systemPrompt", systemPrompt],
  ]) {
    if (typeof value !== "string" || !value.trim()) {
      throw new InvalidStreamError(`${field} is required.`);
    }
  }

  await prisma.stream.create({
    data: { slug, label, description, systemPrompt, userId },
  });

  const root = resolveRoot("custom", slug);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "README.md"),
    `# ${slug}\n\nThis directory is intentionally empty (aside from this file).\n\n` +
      `It's the **output** of FeatureForge's "${label}" stream, registered at runtime ` +
      `rather than built in. Every file that appears here comes from describing a ` +
      `feature to \`POST /api/features/${slug}/plan\`, reviewing the diff, then ` +
      `\`POST /api/features/${slug}/apply\`.\n`,
    "utf8"
  );

  customStreams.set(slug, {
    label,
    description,
    systemPrompt,
    root,
    referenceStreams: [],
    custom: true,
  });

  return { id: slug, label, description, custom: true };
}

export class InvalidStreamError extends Error {}

const IGNORED = new Set(["node_modules", ".git", "dist", "build"]);

function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, base, out);
    } else {
      out.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return out;
}

// Catches a real bug we hit live: Claude prefixed a k8s-stream path with
// "k8s-deploy/" — the stream's own root directory name — even though every
// path is already relative to that root, producing
// k8s-deploy/k8s-deploy/base/Dockerfile. We fixed the prompt that caused
// it, but a prompt fix isn't a guarantee; this is the backstop that turns
// a repeat into a loud, specific error instead of a silently wrong path.
export function looksLikeDuplicatedRoot(streamId, relPath) {
  const rootName = path.basename(getStreamConfig(streamId).root);
  const firstSegment = relPath.split("/")[0];
  return firstSegment === rootName;
}

function allStreamEntries() {
  return [...Object.entries(STREAMS), ...customStreams.entries()];
}

// Some stream roots nest inside another's — mobile's root
// (tripcraft-app/mobile) sits entirely inside fullstack's
// (tripcraft-app/), since a mobile client is genuinely part of "the
// TripCraft app" on disk. That's fine for *reading* (fullstack's context
// legitimately includes mobile's files — that's just what's really in its
// directory tree) but not for *writing*: a path can be safely inside the
// current stream's own root and still belong to a different stream's
// exclusive territory. Found live: a local model asked to add a fullstack
// API endpoint instead "fixed" 10-14 files under mobile/ every time,
// twice in a row, silently gutting real Android app code — nothing
// stopped it, because being inside tripcraft-app/ was all resolveSafe()
// ever checked. Returns the other stream's id if relPath collides with
// its root, else null.
// "Falls inside a stream's root" isn't enough on its own to decide who
// owns a path — when roots nest, a path inside mobile's root is also,
// trivially, inside fullstack's (fullstack's root is an ancestor
// directory). The owner is whichever matching root is the MOST SPECIFIC
// (longest) one — mobile's root is longer/deeper than fullstack's, so it
// wins for anything under mobile/, exactly as it should. Only reject when
// that most-specific owner isn't the stream actually doing the writing.
export function looksLikeCrossStreamWrite(streamId, relPath) {
  const resolved = path.resolve(getStreamConfig(streamId).root, relPath);
  let owner = null;
  let ownerRootLength = -1;
  for (const [otherId, otherCfg] of allStreamEntries()) {
    const otherRoot = otherCfg.root;
    const matches = resolved === otherRoot || resolved.startsWith(otherRoot + path.sep);
    if (matches && otherRoot.length > ownerRootLength) {
      owner = otherId;
      ownerRootLength = otherRoot.length;
    }
  }
  return owner !== null && owner !== streamId ? owner : null;
}

// Refuse to touch anything outside the stream's own root, even if a caller
// passes a relative path with ".." in it. This is one of two
// security-sensitive checks in the whole tool, since Claude's output ends
// up here — see looksLikeCrossStreamWrite above for the other: staying
// inside your own root isn't enough when roots can nest.
function resolveSafe(streamId, relPath) {
  const root = getStreamConfig(streamId).root;
  const resolved = path.resolve(root, relPath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(
      `Refusing to touch a path outside ${streamId}'s target directory: ${relPath}`
    );
  }
  return resolved;
}

export function listFiles(streamId) {
  const root = getStreamConfig(streamId).root;
  if (!fs.existsSync(root)) return [];
  return walk(root).sort();
}

export function readFile(streamId, relPath) {
  const full = resolveSafe(streamId, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

// The hard backstop, independent of whatever pre-validation a caller (like
// runPlan()) already did on the whole plan — this module is the one place
// that's supposed to guarantee a stream can never write outside its own
// exclusive territory, so it enforces that itself rather than trusting
// every caller to have checked first.
function assertOwnTerritory(streamId, relPath) {
  const collision = looksLikeCrossStreamWrite(streamId, relPath);
  if (collision) {
    throw new Error(
      `Refusing to let the "${streamId}" stream write into "${collision}"'s target ` +
        `directory: ${relPath}`
    );
  }
}

export function writeFile(streamId, relPath, content) {
  assertOwnTerritory(streamId, relPath);
  const full = resolveSafe(streamId, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
}

export function deleteFile(streamId, relPath) {
  assertOwnTerritory(streamId, relPath);
  const full = resolveSafe(streamId, relPath);
  if (fs.existsSync(full)) fs.rmSync(full);
}

// Builds the "here's what the project currently looks like" context we
// hand to Claude: the file tree, plus the contents of every existing file
// (each stream's target is small right now, so sending everything is fine
// — a bigger project would need to be smarter about what to include).
export function buildContext(streamId) {
  const tree = listFiles(streamId);
  const files = {};
  for (const relPath of tree) {
    files[relPath] = readFile(streamId, relPath);
  }
  return { tree, files };
}

// Read-only context from another stream's target directory — e.g. the k8s
// stream reading what fullstack actually built, so a Deployment's CMD and
// probe paths match the real app instead of a guess. Building this reuses
// buildContext() itself; nothing here can write anywhere, it just labels
// the result by which stream it came from. Custom streams don't declare
// reference streams yet (there's no UI for it) — always an empty object.
export function buildReferenceContext(streamId) {
  const refs = getStreamConfig(streamId).referenceStreams || [];
  const context = {};
  for (const refId of refs) {
    context[refId] = buildContext(refId);
  }
  return context;
}

// Only the built-in streams have a hand-written prompt baked into
// claudeClient.js; a custom stream's "domain instructions" are whatever
// the person who registered it wrote in systemPrompt.
export function getStreamPromptSource(streamId) {
  const cfg = getStreamConfig(streamId);
  return cfg.custom
    ? { kind: "custom", label: cfg.label, instructions: cfg.systemPrompt }
    : { kind: "builtin", streamId };
}
