// Module 12: the self-improvement loop. A small LangGraph state graph —
// gather the open KnownIssues, ask a local Ollama model to look for a
// pattern and propose what to fix next, record the result.
//
// Deliberately stops at a *written* proposal, not an automatic code diff:
// every stream FeatureForge has (fullstack/k8s/mobile/custom) targets an
// app it builds — tripcraft-app, k8s-deploy, featureforge/custom/<slug>.
// None of them target FeatureForge's own source, and the KnownIssue rows
// this reviews are bugs in that source. Wiring this straight into
// runPlan() would mean a stream that writes into the very backend
// currently executing the request — a real, unsolved safety question, not
// something to hand-wave past. A human reads the proposal and decides
// what to actually build from it, same as any other design recommendation.
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { ChatOllama } from "@langchain/ollama";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { OLLAMA_BASE_URL, OLLAMA_MODEL } from "./ollamaConfig.js";

const MAX_ISSUES_PER_RUN = 8;

const ProposalSchema = z.object({
  hasProposal: z
    .boolean()
    .describe("false if the open issues don't point to a clear, worthwhile next step"),
  summary: z
    .string()
    .describe("1-2 sentences: the pattern noticed across the issues, or why there's nothing actionable"),
  recommendation: z
    .string()
    .describe(
      "A concrete, buildable next step, worded like a FeatureForge feature request — ready to " +
        "hand to a human or paste into the Studio. Empty string if hasProposal is false."
    ),
});

const StateAnnotation = Annotation.Root({
  issues: Annotation({ default: () => [] }),
  proposal: Annotation({ default: () => null }),
});

async function gatherIssues() {
  const issues = await prisma.knownIssue.findMany({
    where: { status: "open" },
    orderBy: { discoveredAt: "desc" },
    take: MAX_ISSUES_PER_RUN,
  });
  return { issues };
}

// A real branch, not just two nodes wired in a line: no open issues means
// no Ollama call at all, rather than asking a model to analyze nothing.
function routeAfterGather(state) {
  return state.issues.length > 0 ? "analyze" : "noAction";
}

async function noAction() {
  return {
    proposal: { hasProposal: false, summary: "No open issues to review.", recommendation: "" },
  };
}

function describeIssues(issues) {
  return issues
    .map((issue, idx) => `${idx + 1}. [${issue.area}] ${issue.title}\n   ${issue.description}`)
    .join("\n\n");
}

async function analyze(state) {
  const model = new ChatOllama({ baseUrl: OLLAMA_BASE_URL, model: OLLAMA_MODEL, temperature: 0.2 });
  const structured = model.withStructuredOutput(ProposalSchema);
  const prompt = [
    "You are FeatureForge's own self-improvement reviewer. Below are real bugs",
    "this tool has actually hit, each tagged with the area of the codebase it",
    "happened in. Look for a pattern across them, or pick the single most",
    "valuable one to address next, and propose ONE concrete, buildable next",
    "step — not a rewrite, not a wishlist, one thing.",
    "",
    "Known issues:",
    describeIssues(state.issues),
  ].join("\n");
  const proposal = await structured.invoke(prompt);
  return { proposal };
}

function buildGraph() {
  return new StateGraph(StateAnnotation)
    .addNode("gatherIssues", gatherIssues)
    .addNode("analyze", analyze)
    .addNode("noAction", noAction)
    .addEdge(START, "gatherIssues")
    .addConditionalEdges("gatherIssues", routeAfterGather, ["analyze", "noAction"])
    .addEdge("analyze", END)
    .addEdge("noAction", END)
    .compile();
}

// trigger: "scheduled" | "manual" — just recorded on the run, doesn't
// change behavior.
export async function runSelfImprovement({ trigger }) {
  try {
    const graph = buildGraph();
    const result = await graph.invoke({});
    const issueIds = result.issues.map((issue) => issue.id);

    const run = await prisma.improvementRun.create({
      data: {
        trigger,
        issueIds: JSON.stringify(issueIds),
        status: result.proposal?.hasProposal ? "proposed" : "no_action",
        proposalSummary: result.proposal?.hasProposal
          ? `${result.proposal.summary}\n\n${result.proposal.recommendation}`.trim()
          : result.proposal?.summary || null,
      },
    });

    if (issueIds.length) {
      await prisma.knownIssue.updateMany({
        where: { id: { in: issueIds } },
        data: { status: "reviewed", reviewedInRun: run.id },
      });
    }

    return run;
  } catch (err) {
    return prisma.improvementRun.create({
      data: {
        trigger,
        issueIds: "[]",
        status: "error",
        errorMessage: err.message,
      },
    });
  }
}
