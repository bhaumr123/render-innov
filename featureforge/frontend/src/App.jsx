import { useEffect, useState } from "react";
import { apiFetch, getToken, clearToken } from "./api.js";
import Auth from "./Auth.jsx";

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

function FeatureForgeApp({ user, onLogOut }) {
  const [streams, setStreams] = useState([]);
  const [stream, setStream] = useState("");
  const [description, setDescription] = useState("");
  const [plan, setPlan] = useState(null);
  const [applied, setApplied] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(null); // "plan" | "apply" | null
  const [error, setError] = useState(null);

  function loadHistory() {
    apiFetch("/api/features/history")
      .then((data) => setHistory(data.requests || []))
      .catch(() => {}); // the history panel is a nice-to-have, not worth an error banner
  }

  // useEffect runs after the component renders. An empty dependency array
  // ([]) means "only run this once, right after the first render" — the
  // standard pattern for "fetch something when the page loads."
  useEffect(() => {
    apiFetch("/api/features/streams")
      .then((data) => {
        setStreams(data.streams || []);
        if (data.streams?.length) setStream(data.streams[0].id);
      })
      .catch(() => setError("Can't reach the backend. Is `npm run dev` running in featureforge/backend?"));
    loadHistory();
  }, []);

  async function handlePlan(e) {
    e.preventDefault();
    setLoading("plan");
    setError(null);
    setPlan(null);
    setApplied(null);
    try {
      const data = await apiFetch(`/api/features/${stream}/plan`, {
        method: "POST",
        body: JSON.stringify({ description }),
      });
      setPlan(data);
      loadHistory();
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
      const data = await apiFetch(`/api/features/${stream}/apply`, {
        method: "POST",
        body: JSON.stringify({ planId: plan.planId }),
      });
      setApplied(data);
      loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="page">
      <header>
        <div className="header-row">
          <div>
            <h1>FeatureForge</h1>
            <p>Describe a feature. Review the diff. Apply it for real.</p>
          </div>
          <div className="account">
            <span>{user.email}</span>
            <button type="button" className="link-btn" onClick={onLogOut}>
              Log out
            </button>
          </div>
        </div>
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

      {history.length > 0 && (
        <section className="history">
          <h2>Your history</h2>
          <ul className="history-list">
            {history.map((h) => (
              <li key={h.id} className="history-item">
                <span className={`badge badge-${h.status === "applied" ? "create" : "modify"}`}>
                  {h.status}
                </span>
                <span className="history-desc">{h.description}</span>
                <span className="history-meta">
                  {h.stream} · {h.fileCount} file{h.fileCount === 1 ? "" : "s"} ·{" "}
                  {new Date(h.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checkedStorage, setCheckedStorage] = useState(false);

  // We only ever stored a token, not the user — on reload, treat "a token
  // exists" as "probably still logged in" and let the first API call prove
  // it. If the token's expired, that call 401s and we fall back to login.
  useEffect(() => {
    if (getToken()) setUser({ email: "…" });
    setCheckedStorage(true);
  }, []);

  if (!checkedStorage) return null;

  if (!user) {
    return <Auth onAuthed={setUser} />;
  }

  return (
    <FeatureForgeApp
      user={user}
      onLogOut={() => {
        clearToken();
        setUser(null);
      }}
    />
  );
}
