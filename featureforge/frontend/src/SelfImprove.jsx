import { useEffect, useState } from "react";
import { apiFetch } from "./api.js";

// Module 12: a minimal view for the self-improvement loop — deliberately
// thin, since the substantial part of this feature is the backend graph
// (see selfImprove.js) and the scheduler that calls it on its own. This is
// just "let a human see what it found and ask it to run now."
const RUN_BADGE = { proposed: "badge-create", no_action: "badge-modify", error: "badge-delete" };

export default function SelfImprove({ onError }) {
  const [issues, setIssues] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(false);

  function load() {
    return Promise.all([
      apiFetch("/api/self-improve/issues?status=open"),
      apiFetch("/api/self-improve/runs"),
    ])
      .then(([issuesData, runsData]) => {
        setIssues(issuesData.issues || []);
        setRuns(runsData.runs || []);
        setLoaded(true);
      })
      .catch(onError);
  }

  useEffect(() => {
    load();
  }, []);

  // A run can come back with status "error" (a 502) without that being a
  // bug in this view — it's the honest, expected outcome whenever the
  // configured Ollama server isn't reachable. Either way the run got
  // recorded, so just reload the lists and let the run's own status badge
  // say what happened.
  function handleRunNow() {
    setRunning(true);
    apiFetch("/api/self-improve/run", { method: "POST" })
      .catch(() => null)
      .then(() => load())
      .finally(() => setRunning(false));
  }

  return (
    <>
      <section className="self-improve-intro">
        <p>
          FeatureForge logs its own real bugs as they happen, then a small LangGraph agent — backed by a
          local Ollama model — periodically looks for a pattern across them and proposes what to build
          next. Below: what it's still reviewing, and what it's said so far.
        </p>
        <button type="button" className="apply-btn" onClick={handleRunNow} disabled={running}>
          {running ? "Running…" : "Run now"}
        </button>
      </section>

      <section className="history">
        <h2>Open issues ({issues.length})</h2>
        {issues.length > 0 ? (
          <ul className="history-list">
            {issues.map((issue) => (
              <li key={issue.id} className="history-item">
                <span className="badge badge-modify">{issue.area}</span>
                <span className="history-desc">{issue.title}</span>
                <span className="history-meta">{new Date(issue.discoveredAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          loaded && <p className="empty-state">Nothing open right now — every known issue has been reviewed.</p>
        )}
      </section>

      <section className="history">
        <h2>Improvement runs</h2>
        {runs.length > 0 ? (
          <ul className="history-list">
            {runs.map((run) => (
              <li key={run.id} className="history-item">
                <span className={`badge ${RUN_BADGE[run.status] || "badge-modify"}`}>{run.status}</span>
                <span className="history-desc">
                  {run.status === "error" ? run.errorMessage : run.proposalSummary || "No proposal."}
                </span>
                <span className="history-meta">
                  {run.trigger} · {new Date(run.ranAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          loaded && <p className="empty-state">No runs yet — the scheduler hasn't fired, or try "Run now" above.</p>
        )}
      </section>
    </>
  );
}
