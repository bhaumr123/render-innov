// llmClient.js is a thin dispatcher — the real generation logic already
// has its own coverage (or, for the Claude side, is verified live against
// the real API throughout this project). What actually needs testing here
// is narrower and more mechanical: does LLM_PROVIDER pick the right
// underlying module, for every value that setting can take. Both
// providers are mocked so this runs without needing an API key or a real
// Ollama server.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const claudePlanFeature = vi.fn().mockResolvedValue({ summary: "claude", files: [] });
const claudePlanFeatureStream = vi.fn().mockResolvedValue({ summary: "claude-stream", files: [] });
const ollamaPlanFeature = vi.fn().mockResolvedValue({ summary: "ollama", files: [] });
const ollamaPlanFeatureStream = vi.fn().mockResolvedValue({ summary: "ollama-stream", files: [] });

vi.mock("../src/lib/claudeClient.js", () => ({
  planFeature: (...args) => claudePlanFeature(...args),
  planFeatureStream: (...args) => claudePlanFeatureStream(...args),
}));
vi.mock("../src/lib/ollamaClient.js", () => ({
  planFeature: (...args) => ollamaPlanFeature(...args),
  planFeatureStream: (...args) => ollamaPlanFeatureStream(...args),
}));

let llmClient;

beforeEach(async () => {
  vi.resetModules();
  claudePlanFeature.mockClear();
  claudePlanFeatureStream.mockClear();
  ollamaPlanFeature.mockClear();
  ollamaPlanFeatureStream.mockClear();
  llmClient = await import("../src/lib/llmClient.js");
});

afterEach(() => {
  delete process.env.LLM_PROVIDER;
});

describe("llmClient", () => {
  it("defaults to Claude when LLM_PROVIDER is unset", async () => {
    expect(llmClient.currentProvider()).toBe("claude");
    await llmClient.planFeature("a", "b", { tree: [], files: {} }, {});
    expect(claudePlanFeature).toHaveBeenCalledTimes(1);
    expect(ollamaPlanFeature).not.toHaveBeenCalled();
  });

  it("routes to Ollama when LLM_PROVIDER=ollama", async () => {
    process.env.LLM_PROVIDER = "ollama";
    vi.resetModules();
    llmClient = await import("../src/lib/llmClient.js");

    expect(llmClient.currentProvider()).toBe("ollama");
    await llmClient.planFeature("a", "b", { tree: [], files: {} }, {});
    expect(ollamaPlanFeature).toHaveBeenCalledTimes(1);
    expect(claudePlanFeature).not.toHaveBeenCalled();
  });

  it("falls back to Claude for any other LLM_PROVIDER value", async () => {
    process.env.LLM_PROVIDER = "something-typo'd";
    vi.resetModules();
    llmClient = await import("../src/lib/llmClient.js");

    expect(llmClient.currentProvider()).toBe("claude");
  });

  it("dispatches planFeatureStream the same way as planFeature", async () => {
    process.env.LLM_PROVIDER = "ollama";
    vi.resetModules();
    llmClient = await import("../src/lib/llmClient.js");

    const onDelta = vi.fn();
    await llmClient.planFeatureStream("a", "b", { tree: [], files: {} }, {}, onDelta);
    expect(ollamaPlanFeatureStream).toHaveBeenCalledWith("a", "b", { tree: [], files: {} }, {}, onDelta);
    expect(claudePlanFeatureStream).not.toHaveBeenCalled();
  });
});
