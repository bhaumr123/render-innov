// Seeds KnownIssue with real bugs this project actually hit, not made-up
// examples — the self-improvement agent's whole premise is "learn from our
// failures," so its starting memory should be honest ones. Run manually:
// node prisma/seed-known-issues.js
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ISSUES = [
  {
    title: "Forced tool-use doesn't guarantee required fields are populated",
    area: "features-api",
    description:
      "The write_code_changes tool schema marks `summary` as required, but a " +
      "real Claude response came back with `files` populated and no `summary` " +
      "key at all. Forced tool-use guarantees the response matches the " +
      "schema's shape, not that every required field is actually filled in. " +
      "Fixed by defaulting summary server-side instead of returning undefined.",
  },
  {
    title: "k8s stream guessed the wrong entry point and health-check path",
    area: "streams",
    description:
      "Without visibility into what the fullstack stream had actually built, " +
      "the k8s stream's first Dockerfile used CMD [\"node\",\"server.js\"] " +
      "(real entry point: src/server.js) and a /healthz probe path (real " +
      "path: /api/health). Fixed by giving streams a referenceStreams list " +
      "so k8s reads fullstack's files as read-only context.",
  },
  {
    title: "Claude prefixed generated paths with the stream's own root directory name",
    area: "streams",
    description:
      "The k8s system prompt said to organize files 'under directories like " +
      "k8s-deploy/base/' — but paths are already relative to that root, so " +
      "Claude wrote k8s-deploy/base/Dockerfile, which resolved to " +
      "k8s-deploy/k8s-deploy/base/Dockerfile on apply, double-nesting. Fixed " +
      "the prompt and added looksLikeDuplicatedRoot() as a backstop that " +
      "rejects such a plan outright rather than silently mis-writing it.",
  },
  {
    title: "HTML pattern attribute regex broke under Chromium's newer parser",
    area: "frontend",
    description:
      "The custom-stream slug input's pattern=\"[a-z][a-z0-9-]{1,40}\" threw " +
      "'Invalid regular expression ... Invalid character class' in a real " +
      "headless-Chromium run — a compile check and unit tests wouldn't have " +
      "caught it, only actually driving the browser did. Fixed by escaping " +
      "the hyphen.",
  },
  {
    title: "changelog.js's scope regex didn't allow commas, silently mis-bucketing commits",
    area: "tooling",
    description:
      "Three real commits used a multi-word scope like feat(db,auth): ... and " +
      "all fell through to the 'misc' bucket because the scope character " +
      "class didn't include ','. Found by reading the tool's own output " +
      "against real history, not by inspecting the regex in isolation.",
  },
  {
    title: "POST /:stream/apply had no try/catch at all",
    area: "features-api",
    description:
      "Unlike /plan and /plan/stream, the apply route never wrapped its body " +
      "in a try/catch — a thrown error (a corrupt filesJson row, a disk " +
      "write failure) would have fallen through to Express's bare default " +
      "error handler instead of a clean JSON error response. Found while " +
      "building this very self-improvement feature, adding error logging to " +
      "every route and noticing this one had nowhere to hook into.",
  },
  {
    title: "max_tokens: 8000 silently truncated real multi-file plans",
    area: "features-api",
    description:
      "Adding the 'website' stream, a real landing-page request (two files: " +
      "a full index.html and styles.css) hit stop_reason 'max_tokens' before " +
      "the tool call's JSON finished streaming — the Anthropic SDK then " +
      "returns an unparseable `{}` as the tool input, which planFeature/plan " +
      "FeatureStream silently accepted as 'no files, no summary' instead of " +
      "surfacing an error. Not website-specific: any stream generating " +
      "enough real content (a bigger fullstack feature, a busy k8s manifest " +
      "set) could hit the same 8000-token ceiling. Fixed by raising it " +
      "(16000 non-streaming, 64000 for the streaming endpoint, per current " +
      "model output limits) and by checking stop_reason explicitly — a " +
      "truncated response now throws a clear error instead of returning an " +
      "empty plan that looks like Claude just had nothing to say.",
  },
  {
    title: "`(plan.files || []).map` crashed when files came back as a raw string",
    area: "features-api",
    description:
      "Testing the new website 'Shop / cart engine' type (a request big " +
      "enough to need 5 real pages plus cart JS) against the real API 3 " +
      "times: 2 runs came back clean, 1 came back with `files` as an " +
      "unparsed JSON *string* instead of a parsed array — a different " +
      "truncation shape than the `{}` case already handled. `(plan.files " +
      "|| [])` doesn't catch this: a truthy string skips the `[]` fallback, " +
      "so `.map()` threw a raw TypeError instead of a clean error response. " +
      "Fixed in runPlan() by checking `Array.isArray(plan.files)` explicitly " +
      "and throwing a clear 502 when it's present but malformed, instead of " +
      "assuming 'truthy therefore usable'.",
  },
  {
    title: "setup-offline.sh's .env check missed .env.example's own commented-out examples",
    area: "tooling",
    description:
      "scripts/setup-offline.sh writes LLM_PROVIDER/OLLAMA_MODEL into " +
      "backend/.env, matching an existing line with `grep -q \"^LLM_PROVIDER=\"` " +
      "before deciding whether to update it in place or append a new one. But " +
      ".env.example already ships both as commented-out examples (`# " +
      "LLM_PROVIDER=ollama`) — the anchored pattern doesn't match a line " +
      "starting with `#`, so a fresh .env (copied straight from the template) " +
      "got a redundant, disconnected LLM_PROVIDER=ollama line appended at the " +
      "bottom instead of the existing example being turned on. Functionally " +
      "harmless (the appended line still wins) but messy, and would confuse " +
      "anyone reading the file afterward. Found by actually running the " +
      "script against a scratch .env, not by reading the sed pattern. Fixed " +
      "by matching an optional leading `#` and whitespace too, and verified " +
      "idempotent (re-running with a different model updates in place).",
  },
  {
    title: "setup-offline.sh never ran prisma migrate deploy — fresh clones had no schema at all",
    area: "tooling",
    description:
      "The first real user to run scripts/setup-offline.sh on an actual " +
      "fresh clone hit `PrismaClientKnownRequestError: The table main.Stream " +
      "does not exist` — the script installs Ollama, pulls a model, writes " +
      ".env, and runs `npm install`, but never runs `npx prisma migrate " +
      "deploy`, so dev.db never gets created/migrated before " +
      "test:offline-plan calls loadCustomStreams(), which queries the " +
      "Stream table. setup-mac.sh (the other bootstrap script) already has " +
      "this exact step — it was simply missed when writing the new script, " +
      "and every sandbox test of it here ran against a dev.db that already " +
      "had migrations applied from earlier work, so the gap never surfaced " +
      "until a genuinely fresh clone hit it. Fixed by adding the same `npx " +
      "prisma migrate deploy` step, and verified against a truly fresh " +
      "database file (not just a fresh directory) that the exact failing " +
      "query succeeds afterward. A reminder that 'tested in the sandbox' " +
      "and 'tested from a fresh clone' are not the same claim.",
  },
];

async function main() {
  for (const issue of ISSUES) {
    const existing = await prisma.knownIssue.findFirst({ where: { title: issue.title } });
    if (existing) continue;
    await prisma.knownIssue.create({ data: issue });
  }
  const count = await prisma.knownIssue.count();
  console.log(`KnownIssue table has ${count} row(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
