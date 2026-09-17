// Manual test harness for the self-improvement analyzer — run this after
// you have a real local Ollama serving a model (see OLLAMA_SETUP.md).
// Doesn't need the backend server running or a login: it calls
// runSelfImprovement() directly, against the same dev.db the app itself
// uses, and prints exactly what a real run produced.
//
// Usage:
//   cd featureforge/backend
//   node scripts/test-analyzer.js
//   OLLAMA_MODEL=llama3.2:1b node scripts/test-analyzer.js   # a smaller/faster model
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { runSelfImprovement } from "../src/lib/selfImprove.js";

const model = process.env.OLLAMA_MODEL || "llama3.1";
const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

console.log(`Analyzer test — model "${model}" at ${baseUrl}`);

const openCount = await prisma.knownIssue.count({ where: { status: "open" } });
console.log(`${openCount} open known issue(s) to review.`);
if (openCount === 0) {
  console.log(
    'Nothing open — run `npm run seed:known-issues` first, or trigger a real ' +
      "failure so a route logs one, if you want something for the model to look at."
  );
}

console.log("\nRunning the graph (this calls Ollama for real — may take a moment)...\n");
const run = await runSelfImprovement({ trigger: "manual" });

console.log(`Run ${run.id} — status: ${run.status}`);
console.log(`Reviewed ${JSON.parse(run.issueIds).length} issue(s).`);

if (run.status === "error") {
  console.log(`\nError: ${run.errorMessage}`);
  console.log(
    "\nIf this says something like 'model not found', run `ollama pull " +
      `${model}\` first. If it says the connection was refused, start the ` +
      "server with `ollama serve` in another terminal."
  );
} else {
  console.log(`\nProposal:\n${run.proposalSummary}`);
}

await prisma.$disconnect();
