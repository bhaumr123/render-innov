// Manual test harness for offline plan generation — run this after you
// have a real local Ollama serving a model (see OLLAMA_SETUP.md). Doesn't
// need the backend server running or a login: it builds a real plan
// request the way runPlan() in routes/features.js does, straight through
// llmClient's ollama provider, and prints exactly what it produced.
//
// Deliberately calls ollamaClient.js directly rather than going through
// llmClient.js's dispatcher: the whole point of this script is testing
// the Ollama path specifically, whatever LLM_PROVIDER happens to be set
// to in your .env for the running app.
//
// Usage:
//   cd featureforge/backend
//   node scripts/test-offline-plan.js
//   node scripts/test-offline-plan.js k8s "add a ConfigMap for env vars"
import "dotenv/config";
import { planFeature } from "../src/lib/ollamaClient.js";
import {
  getStreamPromptSource,
  buildContext,
  buildReferenceContext,
  loadCustomStreams,
  isValidStream,
  listAllStreams,
} from "../src/lib/targetProject.js";

await loadCustomStreams();

const stream = process.argv[2] || "website";
if (!isValidStream(stream)) {
  console.log(`Unknown stream "${stream}". Valid streams: ${listAllStreams().map((s) => s.id).join(", ")}`);
  process.exit(1);
}
const description =
  process.argv[3] || "Feature: Launch site\nSite name: Offline Test\nSite type: Landing page\nWhat it should do: a simple one-page landing site.";

const model = process.env.OLLAMA_MODEL || "llama3.1";
const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

console.log(`Offline plan test — stream "${stream}", model "${model}" at ${baseUrl}`);
console.log(`Description:\n${description}\n`);

const promptSource = getStreamPromptSource(stream);
const context = buildContext(stream);
const referenceContext = buildReferenceContext(stream);

console.log("Generating locally (this calls Ollama for real — may take a while, local models are slower than Claude)...\n");

try {
  const plan = await planFeature(promptSource, description, context, referenceContext);
  console.log("Summary:", plan.summary || "(no summary)");
  console.log("Files:", (plan.files || []).map((f) => `${f.action} ${f.path}`));
} catch (err) {
  console.log("Error:", err.message);
}
