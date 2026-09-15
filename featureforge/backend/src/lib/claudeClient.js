// The one place we talk to Anthropic's API. Two ideas worth calling out:
//
// 1. Structured output via *forced tool-use*. Claude's API doesn't have a
//    "strict JSON mode" — instead, you describe a "tool" (a function) with
//    a JSON schema for its input, and force the model to call it
//    (`tool_choice`). The model's reply is then that structured input,
//    already validated against your schema, instead of free-form prose
//    you'd have to hope parses as JSON.
// 2. The API key only ever lives here, read from process.env. It never
//    reaches the frontend, and it's never logged.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy backend/.env.example to backend/.env " +
        "and add your key from console.anthropic.com."
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

function buildSystemPrompt() {
  return [
    "You are the code-generation engine inside FeatureForge, a tool that",
    "builds a small full-stack app one feature at a time.",
    "",
    "Rules:",
    "- Only touch files necessary for the requested feature. Don't refactor",
    "  unrelated code or add features nobody asked for.",
    "- Prefer creating new small files over growing existing ones.",
    "- Write plain, readable JavaScript. No frameworks or libraries beyond",
    "  what's already in the project unless the feature genuinely needs one",
    "  — if it does, say so in `explanation` and add it to package.json too.",
    "- Always respond by calling the write_code_changes tool. Never reply",
    "  with plain text.",
  ].join("\n");
}

function buildUserMessage(description, tree, files) {
  const treeText = tree.length
    ? tree.map((p) => `  ${p}`).join("\n")
    : "  (empty — nothing has been built yet)";
  const filesText = tree
    .map((p) => `--- ${p} ---\n${files[p]}`)
    .join("\n\n");

  return [
    `Feature requested: ${description}`,
    "",
    "Current project file tree:",
    treeText,
    "",
    filesText ? "Current file contents:\n\n" + filesText : "",
  ].join("\n");
}

export async function planFeature(description, { tree, files }) {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: buildSystemPrompt(),
    tools: [CHANGE_TOOL],
    tool_choice: { type: "tool", name: "write_code_changes" },
    messages: [
      { role: "user", content: buildUserMessage(description, tree, files) },
    ],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) {
    throw new Error("Claude did not return a structured plan.");
  }
  return toolUse.input;
}
