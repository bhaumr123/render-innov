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
  },
  k8s: {
    label: "Kubernetes deployment",
    description:
      "Deployment manifests for the app: Dockerfiles, Deployments, Services, etc.",
    root: resolveRoot("k8s-deploy"),
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
