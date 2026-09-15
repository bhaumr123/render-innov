#!/usr/bin/env node
// "What changed" report generator.
//
// Every commit we make in this project is written as `type(scope): summary`
// (a convention called Conventional Commits — e.g. `feat(auth): add JWT
// login`). This script reads git history for commits touching
// learn-tripcraft/, groups them by scope (auth, db, api, frontend, ...),
// and prints a human-readable report of what changed and where — so any
// time you ask "what did that last request actually touch?", you can run
// this instead of reading a raw diff.
//
// Usage:
//   node scripts/changelog.js            # every commit touching this project
//   node scripts/changelog.js HEAD~5..HEAD
//   node scripts/changelog.js --files    # also list every file touched

const { execSync } = require("child_process");
const path = require("path");

const PROJECT_DIR = "learn-tripcraft";
const AUTH_SENSITIVE = [
  /auth/i,
  /jwt/i,
  /password/i,
  /\.env/,
  /middleware/i,
];

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", cwd: path.resolve(__dirname, "..", "..") });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const showFiles = args.includes("--files");
  const range = args.find((a) => !a.startsWith("--")) || "";
  return { range, showFiles };
}

function getCommits(range) {
  const rangeArg = range ? `${range}` : "";
  const raw = run(
    `git log ${rangeArg} --pretty=format:"%H%x1f%s%x1f%an%x1f%ad" --date=short -- ${PROJECT_DIR}`
  ).trim();
  if (!raw) return [];
  return raw.split("\n").map((line) => {
    const [hash, subject, author, date] = line.split("\x1f");
    return { hash, subject, author, date };
  });
}

function getFiles(hash) {
  const raw = run(
    `git show --numstat --pretty=format:"" ${hash} -- ${PROJECT_DIR}`
  ).trim();
  if (!raw) return [];
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [added, removed, file] = line.split("\t");
      return { added, removed, file };
    });
}

function parseSubject(subject) {
  const match = subject.match(/^(\w+)(\(([\w-]+)\))?:\s*(.+)$/);
  if (!match) return { type: "other", scope: "misc", summary: subject };
  const [, type, , scope, summary] = match;
  return { type, scope: scope || "misc", summary };
}

function isAuthSensitive(files) {
  return files.some((f) => AUTH_SENSITIVE.some((re) => re.test(f.file)));
}

function main() {
  const { range, showFiles } = parseArgs();
  const commits = getCommits(range);

  if (commits.length === 0) {
    console.log("No commits found for that range in learn-tripcraft/.");
    return;
  }

  const byScope = {};
  for (const commit of commits) {
    const { type, scope, summary } = parseSubject(commit.subject);
    const files = getFiles(commit.hash);
    const entry = { ...commit, type, summary, files, sensitive: isAuthSensitive(files) };
    (byScope[scope] ||= []).push(entry);
  }

  console.log(`\n# What changed (${commits.length} commit${commits.length === 1 ? "" : "s"})\n`);

  for (const [scope, entries] of Object.entries(byScope)) {
    console.log(`## ${scope}`);
    for (const e of entries) {
      const flag = e.sensitive ? " ⚠️  touches auth/secrets" : "";
      console.log(`- [${e.type}] ${e.summary} (${e.date}, ${e.hash.slice(0, 7)})${flag}`);
      if (showFiles) {
        for (const f of e.files) {
          console.log(`    ${f.file}  (+${f.added}/-${f.removed})`);
        }
      }
    }
    console.log("");
  }
}

main();
