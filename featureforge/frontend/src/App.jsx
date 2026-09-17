import { useEffect, useState } from "react";
import { apiFetch, apiFetchStream, getToken, clearToken } from "./api.js";
import Auth from "./Auth.jsx";
import DiffView from "./DiffView.jsx";
import NewStreamForm from "./NewStreamForm.jsx";
import FeatureRequestForm from "./FeatureRequestForm.jsx";
import Dashboard from "./Dashboard.jsx";
import SelfImprove from "./SelfImprove.jsx";

const TYPE_LABELS = {
  fullstack: "Full-Stack",
  mobile: "Mobile (Android)",
  k8s: "Kubernetes",
  website: "Website",
  custom: "Custom stream",
};

function FeatureForgeApp({ user, onLogOut, onSessionExpired }) {
  // "dashboard" | "build" | "self-improve" — there's no router yet (see
  // ROADMAP.md), so this is plain component state rather than a real URL.
  // Good enough for a single-page studio; a real route per view is future
  // polish.
  const [view, setView] = useState("dashboard");
  const [buildType, setBuildType] = useState("fullstack");
  const [streams, setStreams] = useState([]);
  const [stream, setStream] = useState("");
  const [plan, setPlan] = useState(null);
  const [applied, setApplied] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [loading, setLoading] = useState(null); // "plan" | "apply" | null
  const [streamingText, setStreamingText] = useState("");
  const [showNewStream, setShowNewStream] = useState(false);
  const [presetCustomStream, setPresetCustomStream] = useState(null);
  const [error, setError] = useState(null);
  // Which LLM is actually answering plan requests — Claude, or a local
  // Ollama model when the backend's LLM_PROVIDER=ollama (see
  // OLLAMA_SETUP.md). GET /api/health reports it; shown as a badge so
  // it's never a surprise which one you're talking to.
  const [llmProvider, setLlmProvider] = useState(null);

  // A 401 here means the token expired or was revoked mid-session (it was
  // valid enough to get past the initial /api/auth/me check, then stopped
  // being valid) — every other failure is just shown as a normal error.
  function handleApiError(err) {
    if (err.status === 401) {
      onSessionExpired();
    } else {
      setError(err.message);
    }
  }

  function loadStreams() {
    return apiFetch("/api/features/streams")
      .then((data) => setStreams(data.streams || []))
      .catch(handleApiError);
  }

  function loadHistory() {
    apiFetch("/api/features/history")
      .then((data) => {
        setHistory(data.requests || []);
        setHistoryLoaded(true);
      })
      .catch((err) => {
        if (err.status === 401) onSessionExpired();
        // otherwise: the history panel is a nice-to-have, not worth an error banner
      });
  }

  // useEffect runs after the component renders. An empty dependency array
  // ([]) means "only run this once, right after the first render" — the
  // standard pattern for "fetch something when the page loads."
  useEffect(() => {
    loadStreams();
    loadHistory();
    // Public endpoint, no auth needed — if it fails, the badge just stays
    // hidden rather than showing an error for something this cosmetic.
    apiFetch("/api/health")
      .then((data) => setLlmProvider(data.llmProvider))
      .catch(() => {});
  }, []);

  function startBuild(type) {
    setBuildType(type);
    setView("build");
    // A fresh build shouldn't show the previous one's leftover plan/diff.
    setPlan(null);
    setApplied(null);
    setError(null);
  }

  // Module 12: streamed instead of a single await — Claude's raw JSON
  // fragments update streamingText as they arrive (see api.js's
  // apiFetchStream for why they're only display text, not parseable on
  // their own), and the final "done" event carries the exact same shape
  // the non-streaming /plan endpoint used to return directly.
  //
  // streamId/description come from FeatureRequestForm, which composes
  // them from whichever guided form (or the custom free-text box) the
  // user filled in — this function doesn't need to know which.
  async function handlePlan(streamId, description) {
    setStream(streamId);
    setLoading("plan");
    setError(null);
    setPlan(null);
    setApplied(null);
    setStreamingText("");
    try {
      await apiFetchStream(`/api/features/${streamId}/plan/stream`, {
        body: JSON.stringify({ description }),
        onDelta: (text) => setStreamingText((prev) => prev + text),
        onDone: (data) => {
          setPlan(data);
          loadHistory();
        },
        onError: (err) => setError(err.message),
      });
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(null);
      setStreamingText("");
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
      handleApiError(err);
    } finally {
      setLoading(null);
    }
  }

  const currentStreamLabel = streams.find((s) => s.id === stream)?.label || stream;

  // On the build screen, only show history for the type you're currently
  // building — a custom stream's builds are whatever isn't one of the
  // built-ins, same grouping Dashboard.jsx uses for its counts.
  const visibleHistory = history.filter((h) =>
    buildType === "custom" ? !["fullstack", "mobile", "k8s", "website"].includes(h.stream) : h.stream === buildType
  );

  return (
    <div className="page">
      <header>
        <div className="header-row">
          <div>
            {view !== "dashboard" && (
              <button type="button" className="link-btn back-link" onClick={() => setView("dashboard")}>
                ← Studio
              </button>
            )}
            <h1>
              {view === "dashboard" && "FeatureForge Studio"}
              {view === "build" && TYPE_LABELS[buildType]}
              {view === "self-improve" && "Self-Improvement"}
            </h1>
            <p>
              {view === "dashboard" && "Pick what you're building. Describe it. Review the diff. Ship it."}
              {view === "build" && "Describe a feature. Review the diff. Apply it for real."}
              {view === "self-improve" && "What FeatureForge has learned from its own real bugs."}
            </p>
          </div>
          <div className="account">
            {llmProvider && (
              <span
                className={`provider-badge provider-badge--${llmProvider}`}
                title={
                  llmProvider === "ollama"
                    ? "Plan generation is running fully offline, against a local Ollama model."
                    : "Plan generation is calling the Claude API."
                }
              >
                {llmProvider === "ollama" ? "💻 Offline (Ollama)" : "⚡ Claude"}
              </span>
            )}
            {view !== "self-improve" && (
              <button type="button" className="link-btn" onClick={() => setView("self-improve")}>
                Self-improvement
              </button>
            )}
            <span>{user.email}</span>
            <button type="button" className="link-btn" onClick={onLogOut}>
              Log out
            </button>
          </div>
        </div>
      </header>

      {view === "dashboard" && <Dashboard streams={streams} history={history} onStartBuild={startBuild} />}

      {view === "self-improve" && <SelfImprove onError={handleApiError} />}

      {view === "build" && (
        <>
          <FeatureRequestForm
            key={buildType}
            initialType={buildType}
            streams={streams}
            loading={loading}
            onSubmit={handlePlan}
            onToggleNewStream={() => setShowNewStream((v) => !v)}
            showingNewStream={showNewStream}
            presetCustomStream={presetCustomStream}
          />

          {showNewStream && (
            <NewStreamForm
              onCreated={(newStream) => {
                setShowNewStream(false);
                loadStreams().then(() => setPresetCustomStream(newStream.id));
              }}
              onError={handleApiError}
            />
          )}

          {loading === "plan" && (
            <div className="streaming-preview">
              <p className="streaming-label">Claude is writing the plan…</p>
              <pre>{streamingText || "…"}</pre>
            </div>
          )}

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
                  Applied {applied.applied.length} file{applied.applied.length === 1 ? "" : "s"} to the{" "}
                  <strong>{currentStreamLabel}</strong> stream's directory.
                </p>
              )}
            </section>
          )}

          <section className="history">
            <h2>{TYPE_LABELS[buildType]} history</h2>
            {visibleHistory.length > 0 ? (
              <ul className="history-list">
                {visibleHistory.map((h) => (
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
            ) : (
              historyLoaded && <p className="empty-state">No requests yet — plan one above to get started.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checkedStorage, setCheckedStorage] = useState(false);
  const [sessionMessage, setSessionMessage] = useState(null);

  function handleSessionExpired() {
    clearToken();
    setUser(null);
    setSessionMessage("Your session expired — please log in again.");
  }

  // A token in localStorage might be expired, revoked, or just wrong — the
  // only way to know is to ask the backend, via the one route built for
  // exactly this (GET /api/auth/me). No token at all skips straight to the
  // login screen without a wasted request.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setCheckedStorage(true);
      return;
    }
    apiFetch("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => handleSessionExpired())
      .finally(() => setCheckedStorage(true));
  }, []);

  if (!checkedStorage) return null;

  if (!user) {
    return (
      <Auth
        message={sessionMessage}
        onAuthed={(u) => {
          setSessionMessage(null);
          setUser(u);
        }}
      />
    );
  }

  return (
    <FeatureForgeApp
      user={user}
      onSessionExpired={handleSessionExpired}
      onLogOut={() => {
        clearToken();
        setUser(null);
      }}
    />
  );
}
