// The offline LLM provider: a local Ollama model instead of the Claude
// API. Same job as claudeClient.js (turn a promptSource + description +
// project context into a { summary, files } plan) and the exact same
// prompt text via promptBuilder.js — the only thing that changes is which
// model answers, and how its structured-output guarantee is obtained.
//
// Claude uses forced tool-use (see claudeClient.js's CHANGE_TOOL); Ollama
// has no equivalent "you must call this tool" mode, so this uses
// LangChain's withStructuredOutput() against a Zod schema describing the
// exact same shape instead. That's a real, proven pattern in this
// codebase already — selfImprove.js uses it the same way for the
// self-improvement agent's proposals.
import { ChatOllama } from "@langchain/ollama";
import { z } from "zod";
import { buildSystemPrompt, buildUserMessage } from "./promptBuilder.js";
import { OLLAMA_BASE_URL, OLLAMA_MODEL } from "./ollamaConfig.js";

// Mirrors claudeClient.js's CHANGE_TOOL field-for-field — kept as a
// separate definition rather than converted from one schema format to the
// other, since Anthropic's JSON-schema tool format and Zod aren't
// interchangeable and a conversion layer for four fields isn't worth the
// indirection.
const changeSchema = z.object({
  summary: z.string().describe("1-2 sentence summary of what this change does and why."),
  files: z.array(
    z.object({
      path: z.string().describe("Path relative to the project root, e.g. backend/src/server.js"),
      action: z.enum(["create", "modify", "delete"]),
      content: z
        .string()
        .optional()
        .describe("The FULL file content after the change (not a diff). Omit for delete."),
      explanation: z.string().describe("One sentence: why this specific file changed."),
    })
  ),
});

function buildPrompt(promptSource, description, tree, files, referenceContext) {
  // withStructuredOutput's .invoke() takes a single prompt reliably (the
  // same call shape selfImprove.js already verified works against a real
  // Ollama server) — a true system/user message split isn't used here to
  // avoid guessing at an unverified array-of-messages call shape for a
  // model/library pairing with no test coverage of its own.
  return [buildSystemPrompt(promptSource), "", "---", "", buildUserMessage(description, tree, files, referenceContext)].join(
    "\n"
  );
}

function friendlyConnectionError(err) {
  if (/fetch failed|ECONNREFUSED/i.test(err.message)) {
    const wrapped = new Error(
      `Couldn't reach a local Ollama server at ${OLLAMA_BASE_URL}. Start one with ` +
        `\`ollama serve\`, and make sure \`ollama pull ${OLLAMA_MODEL}\` has been run — ` +
        "see OLLAMA_SETUP.md."
    );
    wrapped.status = 502;
    return wrapped;
  }
  // Server's reachable, it just doesn't have this model yet — a distinct,
  // more common case than the server being down entirely, and worth its
  // own actionable message rather than a bare 500.
  if (/model .* not found/i.test(err.message)) {
    const wrapped = new Error(`Run \`ollama pull ${OLLAMA_MODEL}\` first (${err.message}).`);
    wrapped.status = 502;
    return wrapped;
  }
  return err;
}

export async function planFeature(promptSource, description, { tree, files }, referenceContext) {
  const model = new ChatOllama({ baseUrl: OLLAMA_BASE_URL, model: OLLAMA_MODEL, temperature: 0.2 });
  const structured = model.withStructuredOutput(changeSchema);
  try {
    return await structured.invoke(buildPrompt(promptSource, description, tree, files, referenceContext));
  } catch (err) {
    throw friendlyConnectionError(err);
  }
}

// The streaming twin of planFeature, matching claudeClient.js's signature
// so llmClient.js's dispatcher can treat both providers identically. Real
// token-by-token streaming of a *validated, schema-checked* structured
// result isn't something withStructuredOutput exposes the way Claude's
// raw input_json_delta events do — rather than fake it, onDelta gets a
// single, honest "working on it" message and the caller waits for the
// real result, same as it always would offline with a local model that's
// typically slower than Claude's API to begin with.
export async function planFeatureStream(promptSource, description, { tree, files }, referenceContext, onDelta) {
  onDelta(`Generating locally with Ollama (${OLLAMA_MODEL}) — this doesn't stream token-by-token like Claude does.`);
  return planFeature(promptSource, description, { tree, files }, referenceContext);
}
