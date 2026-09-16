import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DiffView from "./DiffView.jsx";

describe("DiffView", () => {
  it("shows a fallback message when there's no diff", () => {
    render(<DiffView diff={null} />);
    expect(screen.getByText("No changes to existing content.")).toBeInTheDocument();
  });

  it("colors added and removed lines differently, and leaves headers as context", () => {
    const diff = [
      "Index: a.txt",
      "--- a.txt\tbefore",
      "+++ a.txt\tafter",
      "@@ -1,2 +1,2 @@",
      " unchanged line",
      "-removed line",
      "+added line",
    ].join("\n");

    const { container } = render(<DiffView diff={diff} />);

    // The patch header lines ("--- a.txt", "+++ a.txt") start with the
    // same characters as real +/- content lines — DiffView has to tell
    // them apart, which is exactly the bug class the backend's
    // diffUtil.test.js also guards against, just from the other side.
    expect(container.querySelector(".diff-del")).toHaveTextContent("-removed line");
    expect(container.querySelector(".diff-add")).toHaveTextContent("+added line");
    expect(container.querySelectorAll(".diff-ctx").length).toBeGreaterThan(0);
    expect(container.querySelector(".diff-hunk")).toHaveTextContent("@@ -1,2 +1,2 @@");
  });
});
