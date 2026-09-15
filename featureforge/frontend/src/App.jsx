import { useEffect, useState } from "react";

// The backend runs on a different port than this dev server (4000 vs
// 5173) — that's why server.js needed the cors() middleware.
const API_BASE = "http://localhost:4000";

// Turns a unified diff string into colored lines. This is deliberately
// simple: a line starting with "+" is an addition, "-" a removal, anything
// else (including the "@@" hunk headers) is context.
function DiffView({ diff }) {
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

export default function App() {
  const [streams, setStreams] = useState([]);
  const [stream, setStream] = useState("");
  const [description, setDescription] = useState("");
  const [plan, setPlan] = useState(null);
  const [applied, setApplied] = useState(null);
  const [loading, setLoading] = useState(null); // "plan" | "apply" | null
  const [error, setError] = useState(null);

  // useEffect runs after the component renders. An empty dependency array
  // ([]) means "only run this once, right after the first render" — the
  // standard pattern for "fetch something when the page loads."
  useEffect(() => {
    fetch(`${API_BASE}/api/features/streams`)
      .then((r) => r.json())
      .then((data) => {
        setStreams(data.streams || []);
        if (data.streams?.length) setStream(data.streams[0].id);
      })
      .catch(() => setError("Can't reach the backend. Is `npm run dev` running in featureforge/backend?"));
  }, []);

  async function handlePlan(e) {
    e.preventDefault();
    setLoading("plan");
    setError(null);
    setPlan(null);
    setApplied(null);
    try {
      const res = await fetch(`${API_BASE}/api/features/${stream}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setPlan(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  async function handleApply() {
    setLoading("apply");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/features/${stream}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setApplied(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="page">
      <header>
        <h1>FeatureForge</h1>
        <p>Describe a feature. Review the diff. Apply it for real.</p>
      </header>

      <form onSubmit={handlePlan} className="request-form">
        <label>
          Stream
          <select value={stream} onChange={(e) => setStream(e.target.value)}>
            {streams.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Feature request
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. scaffold an Express backend with a health check endpoint"
            rows={3}
            required
          />
        </label>

        <button type="submit" disabled={loading === "plan" || !stream}>
          {loading === "plan" ? "Asking Claude…" : "Plan this feature"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {plan && (
        <section className="plan">
          <h2>Plan</h2>
          <p className="summary">{plan.summary}</p>

          {plan.files.map((f) => (
            <div key={f.path} className="file-change">
              <div className="file-change__head">
                <span className={`badge badge-${f.action}`}>{f.action}</span>
                <code>{f.path}</code>
              </div>
              <p className="explanation">{f.explanation}</p>
              <DiffView diff={f.diff} />
            </div>
          ))}

          {!applied ? (
            <button onClick={handleApply} disabled={loading === "apply"} className="apply-btn">
              {loading === "apply" ? "Applying…" : "Apply to disk"}
            </button>
          ) : (
            <p className="applied-note">
              Applied {applied.applied.length} file{applied.applied.length === 1 ? "" : "s"} to{" "}
              <code>{stream === "k8s" ? "k8s-deploy/" : "tripcraft-app/"}</code>.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
