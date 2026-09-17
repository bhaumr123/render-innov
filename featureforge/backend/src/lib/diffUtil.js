// Turns two versions of a file's text into a "unified diff" — the same
// +/- format `git diff` prints. We use the well-known `diff` npm package
// rather than writing our own line-matching algorithm; diffing correctly
// (handling moved lines, minimal edit distance, etc.) is a solved problem,
// not something worth reinventing here.
import { createTwoFilesPatch } from "diff";

export function unifiedDiff(relPath, oldContent, newContent) {
  const patch = createTwoFilesPatch(
    relPath,
    relPath,
    oldContent ?? "",
    newContent ?? "",
    "before",
    "after"
  );
  // The library always emits a patch, even for identical input — strip
  // that case down to an explicit "no change" so callers don't need to
  // parse the diff text just to find out nothing happened.
  return oldContent === newContent ? null : patch;
}
