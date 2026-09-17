import { describe, expect, it } from "vitest";
import { isValidStream, looksLikeCrossStreamWrite, looksLikeDuplicatedRoot, STREAMS } from "../src/lib/targetProject.js";

describe("isValidStream", () => {
  it("accepts the built-in streams", () => {
    expect(isValidStream("fullstack")).toBe(true);
    expect(isValidStream("k8s")).toBe(true);
    expect(isValidStream("mobile")).toBe(true);
    expect(isValidStream("website")).toBe(true);
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

describe("looksLikeCrossStreamWrite", () => {
  // Regression test for a real bug, hit live twice in a row: a fullstack
  // request came back with a plan that instead rewrote files under
  // mobile/ — a path that stays inside fullstack's own root (mobile/
  // nests under it on disk) but belongs to the separate "mobile" stream.
  it("catches a fullstack path that actually belongs to the nested mobile stream", () => {
    expect(looksLikeCrossStreamWrite("fullstack", "mobile/build.gradle.kts")).toBe("mobile");
  });

  it("leaves a normal fullstack path alone", () => {
    expect(looksLikeCrossStreamWrite("fullstack", "backend/src/app.js")).toBeNull();
  });

  // The tricky asymmetric case: mobile's root is a CHILD of fullstack's
  // root, so a path inside mobile's own territory is also, trivially,
  // inside fullstack's root — the "most specific root wins" rule is what
  // keeps mobile able to write to itself at all.
  it("lets the mobile stream write inside its own (nested) root", () => {
    expect(looksLikeCrossStreamWrite("mobile", "app/build.gradle.kts")).toBeNull();
  });

  it("catches an escape attempt into a sibling stream via ..", () => {
    expect(looksLikeCrossStreamWrite("fullstack", "../k8s-deploy/base/Dockerfile")).toBe("k8s");
  });

  it("leaves every built-in stream free to write its own files", () => {
    expect(looksLikeCrossStreamWrite("k8s", "base/Dockerfile")).toBeNull();
    expect(looksLikeCrossStreamWrite("website", "acme/index.html")).toBeNull();
  });
});
