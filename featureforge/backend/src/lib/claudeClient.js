// The Claude-backed LLM provider. Two ideas worth calling out:
//
// 1. Structured output via *forced tool-use*. Claude's API doesn't have a
//    "strict JSON mode" — instead, you describe a "tool" (a function) with
//    a JSON schema for its input, and force the model to call it
//    (`tool_choice`). The model's reply is then that structured input,
//    already validated against your schema, instead of free-form prose
//    you'd have to hope parses as JSON.
// 2. The API key only ever lives here, read from process.env. It never
//    reaches the frontend, and it's never logged.
//
// This is one of two providers behind llmClient.js's dispatcher — see
// ollamaClient.js for the offline twin, and promptBuilder.js for the
// system/user prompt text both of them share.
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, buildUserMessage } from "./promptBuilder.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

// A real bug, found live while building the 'website' stream: a landing
// page's full HTML + CSS genuinely needs more than 8000 output tokens, and
// forced tool-use has nowhere to put the overflow — it just cuts off
// mid-JSON (stop_reason "max_tokens"), and the tool call's `input` comes
// back as an unparseable `{}` instead of a partial result. The streaming
// endpoint has no HTTP-timeout reason to stay low, so it gets more room.
const MAX_TOKENS_NON_STREAMING = 16000;
const MAX_TOKENS_STREAMING = 64000;

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy backend/.env.example to backend/.env " +
        "and add your key from console.anthropic.com — or set LLM_PROVIDER=ollama " +
        "in .env to generate offline with a local model instead."
    );
  }
  return new Anthropic({ apiKey });
}

const CHANGE_TOOL = {
  name: "write_code_changes",
  description:
    "Propose the exact set of file changes needed to implement the requested feature.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "1-2 sentence summary of what this change does and why.",
      },
      files: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "Path relative to the project root, e.g. backend/src/server.js",
            },
            action: { type: "string", enum: ["create", "modify", "delete"] },
            content: {
              type: "string",
              description:
                "The FULL file content after the change (not a diff). Omit for delete.",
            },
            explanation: {
              type: "string",
              description: "One sentence: why this specific file changed.",
            },
          },
          required: ["path", "action", "explanation"],
        },
      },
    },
    required: ["summary", "files"],
  },
};

export async function planFeature(promptSource, description, { tree, files }, referenceContext) {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS_NON_STREAMING,
    system: buildSystemPrompt(promptSource),
    tools: [CHANGE_TOOL],
    tool_choice: { type: "tool", name: "write_code_changes" },
    messages: [
      {
        role: "user",
        content: buildUserMessage(description, tree, files, referenceContext),
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("Claude did not return a structured plan.");
  }
  if (response.stop_reason === "max_tokens") {
    const err = new Error(
      `Claude's response was cut off at the ${MAX_TOKENS_NON_STREAMING}-token limit before finishing ` +
        "the plan — try asking for a smaller change, or splitting this into separate requests."
    );
    // A known, expected failure mode with a clear, actionable message —
    // not a bug in this code, so it shouldn't feed the self-improvement
    // agent's "unexpected error" log the way an actual crash would (see
    // maybeLogFailure in routes/features.js, which skips anything with a
    // .status already set).
    err.status = 502;
    throw err;
  }
  return toolUse.input;
}

// The streaming twin of planFeature. Same request, same forced tool-use —
// the only difference is *how* the response arrives. Claude streams the
// tool call's input as a sequence of raw JSON text fragments (an
// `input_json_delta` per chunk); onDelta gets each fragment as it
// arrives, so a caller can show "Claude is writing..." instead of a blank
// spinner. The fragments are NOT valid JSON individually — only once
// they're all concatenated — so onDelta is for display only; the actual
// parsed result still comes back at the end, exactly like planFeature.
export async function planFeatureStream(
  promptSource,
  description,
  { tree, files },
  referenceContext,
  onDelta
) {
  const client = getClient();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS_STREAMING,
    system: buildSystemPrompt(promptSource),
    tools: [CHANGE_TOOL],
    tool_choice: { type: "tool", name: "write_code_changes" },
    messages: [
      {
        role: "user",
        content: buildUserMessage(description, tree, files, referenceContext),
      },
    ],
  });

  stream.on("streamEvent", (event) => {
    if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
      onDelta(event.delta.partial_json);
    }
  });

  const finalMessage = await stream.finalMessage();
  const toolUse = finalMessage.content.find((block) => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("Claude did not return a structured plan.");
  }
  if (finalMessage.stop_reason === "max_tokens") {
    const err = new Error(
      `Claude's response was cut off at the ${MAX_TOKENS_STREAMING}-token limit before finishing ` +
        "the plan — try asking for a smaller change, or splitting this into separate requests."
    );
    err.status = 502; // expected failure mode, not a bug — see the non-streaming twin above
    throw err;
  }
  return toolUse.input;
}
