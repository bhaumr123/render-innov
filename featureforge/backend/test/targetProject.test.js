import { describe, expect, it } from "vitest";
import { isValidStream, looksLikeDuplicatedRoot, STREAMS } from "../src/lib/targetProject.js";

describe("isValidStream", () => {
  it("accepts the two real streams", () => {
    expect(isValidStream("fullstack")).toBe(true);
    expect(isValidStream("k8s")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidStream("bogus")).toBe(false);
    expect(isValidStream("")).toBe(false);
  });
});

describe("looksLikeDuplicatedRoot", () => {
  // Regression test for a real bug: Claude once prefixed a k8s-stream path
  // with "k8s-deploy/" — the stream's own root directory name — which
  // would have double-nested on apply (k8s-deploy/k8s-deploy/base/...).
  it("catches a path prefixed with its own stream's root name", () => {
    const rootName = STREAMS.k8s.root.split("/").pop();
    expect(looksLikeDuplicatedRoot("k8s", `${rootName}/base/Dockerfile`)).toBe(true);
  });

  it("leaves a normal, correctly relative path alone", () => {
    expect(looksLikeDuplicatedRoot("k8s", "base/Dockerfile")).toBe(false);
  });

  it("doesn't false-positive across streams", () => {
    // A file that happens to start with "fullstack" inside the k8s
    // stream is fine — only the k8s root's own name is suspicious there.
    expect(looksLikeDuplicatedRoot("k8s", "fullstack-notes.md")).toBe(false);
  });
});
