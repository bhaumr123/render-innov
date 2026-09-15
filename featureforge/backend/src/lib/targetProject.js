// Everything FeatureForge does to the target app goes through here. Keeping
// all filesystem access in one small module means: (a) it's the only place
// that needs to know where tripcraft-app/ lives, and (b) it's the one place
// we'd add safety checks (e.g. refusing to write outside the target root).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// backend/src/lib -> backend/src -> backend -> featureforge -> tripcraft-app
export const TARGET_ROOT = path.resolve(__dirname, "../../../tripcraft-app");

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

// Refuse to touch anything outside tripcraft-app/, even if a caller passes
// a relative path with ".." in it. This is the one security-sensitive spot
// in the whole tool, since Claude's output ends up here.
function resolveSafe(relPath) {
  const resolved = path.resolve(TARGET_ROOT, relPath);
  if (!resolved.startsWith(TARGET_ROOT + path.sep) && resolved !== TARGET_ROOT) {
    throw new Error(`Refusing to touch a path outside tripcraft-app/: ${relPath}`);
  }
  return resolved;
}

export function listFiles() {
  if (!fs.existsSync(TARGET_ROOT)) return [];
  return walk(TARGET_ROOT).sort();
}

export function readFile(relPath) {
  const full = resolveSafe(relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

export function writeFile(relPath, content) {
  const full = resolveSafe(relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
}

export function deleteFile(relPath) {
  const full = resolveSafe(relPath);
  if (fs.existsSync(full)) fs.rmSync(full);
}

// Builds the "here's what the project currently looks like" context we
// hand to Claude: the file tree, plus the contents of every existing file
// (tripcraft-app/ is small right now, so sending everything is fine — a
// bigger project would need to be smarter about what to include).
export function buildContext() {
  const tree = listFiles();
  const files = {};
  for (const relPath of tree) {
    files[relPath] = readFile(relPath);
  }
  return { tree, files };
}
