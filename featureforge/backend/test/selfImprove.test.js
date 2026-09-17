// The self-improvement agent's own test suite. Real bugs deserve a real
// regression test the same as any other code path — but the actual
// Ollama call can't be part of it: CI (and this sandbox) has no Ollama
// server to talk to. So @langchain/ollama's ChatOllama is mocked here,
// the same way you'd mock any external network dependency — everything
// else (gathering real issues from a real throwaway DB, the graph's
// conditional routing, what gets recorded and what status lands on the
// ImprovementRun) runs for real.
//
// This is deliberately separate from the manual verification already
// done against a real Ollama server (see ROADMAP.md's Module 12 entry) —
// that proved the HTTP integration is correct; this proves the graph's
// control flow is correct, every time, without needing Ollama installed.
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, "..");
const TEST_DB_PATH = path.join(BACKEND_DIR, "prisma", "test-selfimprove.db");

process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;

// invoke() is reassigned per test via mockResolvedValueOnce/mockRejectedValueOnce.
// withStructuredOutput() itself is what analyze() calls to get something
// with an .invoke() — the mock just needs to return that shape back.
const invoke = vi.fn();
vi.mock("@langchain/ollama", () => ({
  ChatOllama: vi.fn().mockImplementation(() => ({
    withStructuredOutput: () => ({ invoke }),
  })),
}));

let prisma;
let runSelfImprovement;

beforeAll(async () => {
  fs.rmSync(TEST_DB_PATH, { force: true });
  execSync("npx prisma migrate deploy", {
    cwd: BACKEND_DIR,
    env: process.env,
    stdio: "pipe",
  });

  ({ prisma } = await import("../src/lib/prisma.js"));
  ({ runSelfImprovement } = await import("../src/lib/selfImprove.js"));
});

afterEach(async () => {
  invoke.mockReset();
  // Each test brings its own KnownIssue rows and reads them back via the
  // run it triggers — starting every test from an empty table is simpler
  // and more honest than relying on execution order to leave the right
  // rows behind.
  await prisma.improvementRun.deleteMany({});
  await prisma.knownIssue.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
  fs.rmSync(TEST_DB_PATH, { force: true });
  fs.rmSync(`${TEST_DB_PATH}-journal`, { force: true });
});

describe("runSelfImprovement", () => {
  it("skips the model entirely when there are no open issues", async () => {
    const run = await runSelfImprovement({ trigger: "manual" });

    expect(run.status).toBe("no_action");
    expect(JSON.parse(run.issueIds)).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("gathers open issues, records a proposal, and marks them reviewed", async () => {
    const issue = await prisma.knownIssue.create({
      data: {
        title: "Fake bug for this test",
        description: "Not a real bug — exists only to exercise the graph.",
        area: "test",
        status: "open",
      },
    });
    invoke.mockResolvedValueOnce({
      hasProposal: true,
      summary: "Pattern noticed across the issues.",
      recommendation: "Build the concrete next step.",
    });

    const run = await runSelfImprovement({ trigger: "manual" });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(run.status).toBe("proposed");
    expect(run.proposalSummary).toContain("Pattern noticed");
    expect(run.proposalSummary).toContain("Build the concrete next step");
    expect(JSON.parse(run.issueIds)).toEqual([issue.id]);

    const reloaded = await prisma.knownIssue.findUnique({ where: { id: issue.id } });
    expect(reloaded.status).toBe("reviewed");
    expect(reloaded.reviewedInRun).toBe(run.id);
  });

  it("marks issues reviewed even when the model finds nothing actionable", async () => {
    await prisma.knownIssue.create({
      data: { title: "Minor thing", description: "Not worth acting on.", area: "test", status: "open" },
    });
    invoke.mockResolvedValueOnce({
      hasProposal: false,
      summary: "Nothing actionable across these.",
      recommendation: "",
    });

    const run = await runSelfImprovement({ trigger: "scheduled" });

    expect(run.status).toBe("no_action");
    expect(run.proposalSummary).toBe("Nothing actionable across these.");
    const stillOpen = await prisma.knownIssue.count({ where: { status: "open" } });
    expect(stillOpen).toBe(0);
  });

  it("records an error run and leaves issues untouched when the model call fails", async () => {
    const issue = await prisma.knownIssue.create({
      data: { title: "Another fake bug", description: "For the failure path.", area: "test", status: "open" },
    });
    invoke.mockRejectedValueOnce(new Error("simulated: Ollama unreachable"));

    const run = await runSelfImprovement({ trigger: "manual" });

    expect(run.status).toBe("error");
    expect(run.errorMessage).toBe("simulated: Ollama unreachable");
    expect(JSON.parse(run.issueIds)).toEqual([]);

    const reloaded = await prisma.knownIssue.findUnique({ where: { id: issue.id } });
    expect(reloaded.status).toBe("open");
    expect(reloaded.reviewedInRun).toBeNull();
  });

  it("caps how many issues a single run reviews", async () => {
    for (let i = 0; i < 10; i++) {
      await prisma.knownIssue.create({
        data: { title: `Bulk issue ${i}`, description: "x", area: "test", status: "open" },
      });
    }
    invoke.mockResolvedValueOnce({ hasProposal: false, summary: "Too many to summarize meaningfully.", recommendation: "" });

    const run = await runSelfImprovement({ trigger: "manual" });

    expect(JSON.parse(run.issueIds)).toHaveLength(8); // MAX_ISSUES_PER_RUN in selfImprove.js
    const stillOpen = await prisma.knownIssue.count({ where: { status: "open" } });
    expect(stillOpen).toBe(2);
  });
});
