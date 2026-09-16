// Everything FeatureForge writes goes through here. Keeping all filesystem
// access in one small module means: (a) it's the only place that needs to
// know where each stream's target directory lives, and (b) it's the one
// place we'd add safety checks (e.g. refusing to write outside that root).
//
// A "stream" is just a named target: a directory FeatureForge is allowed to
// modify, plus (in claudeClient.js) a system prompt tuned for what belongs
// in it. Two streams share this exact same plan -> diff -> apply pipeline;
// they only differ in *where* they write and *what kind* of files Claude is
// asked to produce.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// backend/src/lib -> backend/src -> backend -> featureforge -> <dir>
function resolveRoot(dirName) {
  return path.resolve(__dirname, "../../../", dirName);
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
};

export function isValidStream(streamId) {
  return Object.prototype.hasOwnProperty.call(STREAMS, streamId);
}

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
  const rootName = path.basename(STREAMS[streamId].root);
  const firstSegment = relPath.split("/")[0];
  return firstSegment === rootName;
}

// Refuse to touch anything outside the stream's own root, even if a caller
// passes a relative path with ".." in it. This is the one
// security-sensitive spot in the whole tool, since Claude's output ends up
// here — and it's also what keeps the two streams from ever writing into
// each other's directory by mistake.
function resolveSafe(streamId, relPath) {
  const root = STREAMS[streamId].root;
  const resolved = path.resolve(root, relPath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(
      `Refusing to touch a path outside ${streamId}'s target directory: ${relPath}`
    );
  }
  return resolved;
}

export function listFiles(streamId) {
  const root = STREAMS[streamId].root;
  if (!fs.existsSync(root)) return [];
  return walk(root).sort();
}

export function readFile(streamId, relPath) {
  const full = resolveSafe(streamId, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

export function writeFile(streamId, relPath, content) {
  const full = resolveSafe(streamId, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
}

export function deleteFile(streamId, relPath) {
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
// the result by which stream it came from.
export function buildReferenceContext(streamId) {
  const refs = STREAMS[streamId].referenceStreams || [];
  const context = {};
  for (const refId of refs) {
    context[refId] = buildContext(refId);
  }
  return context;
}
