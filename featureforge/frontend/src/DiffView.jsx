// Turns a unified diff string into colored lines. This is deliberately
// simple: a line starting with "+" is an addition, "-" a removal, anything
// else (including the "@@" hunk headers) is context.
export default function DiffView({ diff }) {
  if (!diff) return <p className="diff-empty">No changes to existing content.</p>;
  return (
    <pre className="diff">
      {diff.split("\n").map((line, i) => {
        let kind = "ctx";
        if (line.startsWith("+") && !line.startsWith("+++")) kind = "add";
        else if (line.startsWith("-") && !line.startsWith("---")) kind = "del";
        else if (line.startsWith("@@")) kind = "hunk";
        return (
          <div key={i} className={`diff-line diff-${kind}`}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}
