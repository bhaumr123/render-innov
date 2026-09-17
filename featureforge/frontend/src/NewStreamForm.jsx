import { useState } from "react";
import { apiFetch } from "./api.js";

// Module 12: the frontend half of registering a custom stream. Small and
// separate from App.jsx on purpose — it's a self-contained form with its
// own local state, not something the main view needs to know the guts of.
export default function NewStreamForm({ onCreated, onError }) {
  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setLocalError(null);
    try {
      const data = await apiFetch("/api/features/streams", {
        method: "POST",
        body: JSON.stringify({ slug, label, description, systemPrompt }),
      });
      onCreated(data.stream);
    } catch (err) {
      if (err.status === 400) setLocalError(err.message);
      else onError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="request-form new-stream-form">
      <p className="form-intro">
        Register a new target project — its own directory FeatureForge can build
        into, separate from the built-in streams.
      </p>

      <label>
        Slug
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="docs-site"
          pattern="[a-z][a-z0-9\-]{1,40}"
          required
        />
        <span className="hint">Lowercase letters, digits, hyphens. Becomes its directory name.</span>
      </label>

      <label>
        Label
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Docs site" required />
      </label>

      <label>
        Description
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A small static docs site for the app"
          required
        />
      </label>

      <label>
        What belongs here (Claude's instructions for this stream)
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Write plain Markdown files documenting the app. No app code, no HTML/CSS."
          rows={3}
          required
        />
      </label>

      {localError && <p className="error">{localError}</p>}

      <button type="submit" disabled={loading}>
        {loading ? "Creating…" : "Create stream"}
      </button>
    </form>
  );
}
