import { describe, expect, it } from "vitest";
import { unifiedDiff } from "../src/lib/diffUtil.js";

describe("unifiedDiff", () => {
  it("returns null when nothing changed", () => {
    expect(unifiedDiff("a.txt", "same", "same")).toBeNull();
  });

  it("marks every content line as added for a brand-new file", () => {
    const diff = unifiedDiff("new.txt", null, "line one\nline two\n");
    expect(diff).toContain("+line one");
    expect(diff).toContain("+line two");
    // Only the patch header's "--- new.txt" line should start with "-" —
    // no actual content line should (that would mean something was
    // removed, which is impossible when the file didn't exist before).
    const contentLines = diff.split("\n").filter((l) => !l.startsWith("---") && !l.startsWith("+++"));
    expect(contentLines.some((l) => l.startsWith("-"))).toBe(false);
  });

  it("marks every line as removed for a deleted file", () => {
    const diff = unifiedDiff("gone.txt", "line one\n", "");
    expect(diff).toContain("-line one");
  });

  it("shows only the changed lines as +/- for a modification", () => {
    const diff = unifiedDiff("a.txt", "keep\nold\n", "keep\nnew\n");
    expect(diff).toContain("-old");
    expect(diff).toContain("+new");
    // The unchanged line is context, not a +/- line.
    expect(diff).toMatch(/^ keep/m);
  });
});
