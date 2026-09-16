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

// Shared rules every stream follows, regardless of what kind of files it
// produces.
const COMMON_RULES = [
  "- Only touch files necessary for the requested feature. Don't refactor",
  "  unrelated files or add anything nobody asked for.",
  "- Prefer creating new small files over growing existing ones.",
  "- Always respond by calling the write_code_changes tool. Never reply",
  "  with plain text.",
  "- Every `path` is already relative to this stream's own project root.",
  "  Never prefix a path with that root directory's own name (e.g. write",
  "  `base/Dockerfile`, not `k8s-deploy/base/Dockerfile` — the tree shown",
  "  to you below already starts inside that root).",
];

// Each stream gets its own system prompt: same tool, same JSON schema,
// different idea of what a "file" should contain. This is the whole trick
// to supporting more than one kind of output with one pipeline — the
// plan/diff/apply code never needs to know it's looking at YAML instead of
// JavaScript.
const STREAM_PROMPTS = {
  fullstack: [
    "You are the code-generation engine inside FeatureForge, working on the",
    "'fullstack' stream: TripCraft's actual application code (backend API,",
    "frontend, database).",
    "",
    "Rules:",
    ...COMMON_RULES,
    "- Write plain, readable JavaScript. No frameworks or libraries beyond",
    "  what's already in the project unless the feature genuinely needs one",
    "  — if it does, say so in `explanation` and add it to package.json too.",
  ].join("\n"),

  k8s: [
    "You are the code-generation engine inside FeatureForge, working on the",
    "'k8s' stream: Kubernetes deployment manifests and Dockerfiles for",
    "TripCraft. You are NOT writing application code here — only the files",
    "needed to containerize and deploy it.",
    "",
    "Rules:",
    ...COMMON_RULES,
    "- Write valid Kubernetes YAML (apiVersion, kind, metadata, spec) or a",
    "  Dockerfile, one resource (or one Dockerfile) per file, organized",
    "  under a subdirectory like `base/` (e.g. `base/Dockerfile`).",
    "- Every container spec needs resource requests/limits and, for a long-",
    "  running service, liveness and readiness probes.",
    "- Prefer standard, boring Kubernetes objects (Deployment, Service,",
    "  ConfigMap, Secret-as-placeholder) over CRDs or a specific cloud",
    "  provider's extensions unless the request specifically asks for one.",
    "- Never write real secret values into a manifest — use a placeholder",
    "  and say in `explanation` that it must be filled in out-of-band.",
    "- If a reference app's contents are provided below, they are the",
    "  ground truth: match its actual entry point, port, and route paths",
    "  exactly. Never guess a filename or path that reference context",
    "  already answers.",
  ].join("\n"),
};

// promptSource comes from targetProject.js's getStreamPromptSource():
// { kind: "builtin", streamId } for fullstack/k8s, or
// { kind: "custom", label, instructions } for a runtime-registered stream.
// Custom streams don't get a hand-written prompt — they get whoever
// registered them's own description of what belongs there, wrapped in the
// same COMMON_RULES every stream follows regardless of its content.
function buildSystemPrompt(promptSource) {
  if (promptSource.kind === "builtin") {
    return STREAM_PROMPTS[promptSource.streamId];
  }
  return [
    "You are the code-generation engine inside FeatureForge, working on a",
    `custom stream: "${promptSource.label}".`,
    "",
    "What belongs in this stream, in its own words:",
    promptSource.instructions,
    "",
    "Rules:",
    ...COMMON_RULES,
  ].join("\n");
}

function describeContext(label, tree, files) {
  const treeText = tree.length
    ? tree.map((p) => `  ${p}`).join("\n")
    : "  (empty — nothing has been built yet)";
  const filesText = tree.map((p) => `--- ${p} ---\n${files[p]}`).join("\n\n");
  return [
    `${label} file tree:`,
    treeText,
    "",
    filesText ? `${label} file contents:\n\n${filesText}` : "",
  ].join("\n");
}

function buildUserMessage(description, tree, files, referenceContext) {
  const sections = [
    `Feature requested: ${description}`,
    "",
    describeContext("Current project", tree, files),
  ];

  for (const [refId, ref] of Object.entries(referenceContext || {})) {
    sections.push(
      "",
      `--- Reference: the "${refId}" stream (read-only — you are not writing to this) ---`,
      describeContext(`"${refId}" stream`, ref.tree, ref.files)
    );
  }

  return sections.join("\n");
}

export async function planFeature(promptSource, description, { tree, files }, referenceContext) {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
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
  return toolUse.input;
}

// Module 12: the streaming twin of planFeature. Same request, same forced
// tool-use — the only difference is *how* the response arrives. Claude
// streams the tool call's input as a sequence of raw JSON text fragments
// (an `input_json_delta` per chunk); onDelta gets each fragment as it
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
    max_tokens: 8000,
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
  return toolUse.input;
}
