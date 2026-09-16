import { useEffect, useState } from "react";

// The three built-in streams get a guided form each — the fields ask for
// exactly what that domain needs (a k8s replica count, a mobile screen
// name) instead of leaving you to remember to mention it in a paragraph.
// A custom stream can't get a tailored form (FeatureForge has no idea
// what fields its domain needs), so it keeps the original free-text box.
const TYPES = [
  { id: "fullstack", label: "Full-Stack" },
  { id: "mobile", label: "Mobile (Android)" },
  { id: "k8s", label: "Kubernetes" },
  { id: "website", label: "Website" },
  { id: "custom", label: "Custom stream" },
];

// Mirrors the backend's site-type library (backend/src/lib/
// websiteTypeLibrary.js) by label — the frontend and backend are separate
// deployables with no shared module today, so this list is kept in sync
// by hand, same as TYPES above already is with the backend's stream list.
// The backend library is the one with the actual structural guidance per
// type; this is just what a person picks from.
const WEBSITE_SITE_TYPES = [
  "Landing page",
  "Portfolio",
  "Blog",
  "Business / marketing site",
  "E-commerce storefront",
  "Shop / cart engine",
  "Restaurant / cafe",
  "Real estate listings",
  "Event / conference",
  "Nonprofit / donation",
  "SaaS / app product site",
  "Documentation site",
  "Personal resume / CV",
  "News / magazine",
  "Directory / listings",
  "Wedding / personal event",
  "Agency / freelancer services",
  "App / download landing page",
  "Coming soon / waitlist",
  "Other",
];

// Turns the guided fields into the same kind of plain-English description
// the backend already expects — no API change needed. The structure just
// makes sure nothing the domain cares about gets left out.
function composeDescription(type, f) {
  const lines = [`Feature: ${f.title}`];
  if (type === "fullstack") {
    lines.push(`Area: ${f.area}`);
    lines.push(`What it should do: ${f.description}`);
    if (f.details.trim()) lines.push(`Additional details: ${f.details}`);
  } else if (type === "mobile") {
    if (f.screen.trim()) lines.push(`Screen: ${f.screen}`);
    lines.push(`What it should do: ${f.description}`);
    if (f.needsNetwork) {
      lines.push(`Calls the backend API${f.endpoint.trim() ? ` at ${f.endpoint}` : ""}.`);
    }
  } else if (type === "k8s") {
    lines.push(`Resource type: ${f.resourceType}`);
    if (f.resourceType === "Deployment") lines.push(`Replicas: ${f.replicas}`);
    if (f.resources.trim()) lines.push(`Resource limits: ${f.resources}`);
    lines.push(`What it should do: ${f.description}`);
  } else if (type === "website") {
    lines.push(`Site name: ${f.siteName}`);
    lines.push(`Site type: ${f.siteType}`);
    if (f.sections.trim()) lines.push(`Sections/pages needed: ${f.sections}`);
    lines.push(`What it should do: ${f.description}`);
    if (f.style.trim()) lines.push(`Style/tone: ${f.style}`);
  }
  return lines.join("\n");
}

export default function FeatureRequestForm({
  streams,
  loading,
  onSubmit,
  onToggleNewStream,
  showingNewStream,
  presetCustomStream,
  initialType,
}) {
  // App.jsx remounts this component (via a `key` tied to the dashboard
  // card you clicked) whenever it wants a different initial type — that's
  // simpler and more predictable than reacting to a changing prop mid-life.
  const [type, setType] = useState(initialType || "fullstack");
  const [fullstack, setFullstack] = useState({
    title: "",
    description: "",
    area: "Both / full stack",
    details: "",
  });
  const [mobile, setMobile] = useState({
    title: "",
    screen: "",
    description: "",
    needsNetwork: false,
    endpoint: "",
  });
  const [k8s, setK8s] = useState({
    title: "",
    resourceType: "Deployment",
    replicas: "2",
    resources: "",
    description: "",
  });
  const [website, setWebsite] = useState({
    title: "",
    siteName: "",
    siteType: "Landing page",
    sections: "",
    description: "",
    style: "",
  });
  const [customStreamId, setCustomStreamId] = useState("");
  const [customDescription, setCustomDescription] = useState("");

  const customStreams = streams.filter((s) => s.custom);

  // After registering a new custom stream, switch straight to it instead
  // of leaving you on whatever tab you were on with no visible sign the
  // stream you just created is even selectable yet.
  useEffect(() => {
    if (presetCustomStream) {
      setType("custom");
      setCustomStreamId(presetCustomStream);
    }
  }, [presetCustomStream]);

  function handleSubmit(e) {
    e.preventDefault();
    if (type === "custom") {
      onSubmit(customStreamId, customDescription);
      return;
    }
    const fields = { fullstack, mobile, k8s, website }[type];
    onSubmit(type, composeDescription(type, fields));
  }

  const submitDisabled =
    loading === "plan" || (type === "custom" && (!customStreamId || !customDescription.trim()));

  return (
    <form onSubmit={handleSubmit} className="request-form">
      <div className="type-tabs">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={type === t.id ? "tab active" : "tab"}
            onClick={() => setType(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {type === "fullstack" && (
        <>
          <label>
            Feature title
            <input
              value={fullstack.title}
              onChange={(e) => setFullstack({ ...fullstack, title: e.target.value })}
              placeholder="e.g. User profile page"
              required
            />
          </label>
          <label>
            Area
            <select
              value={fullstack.area}
              onChange={(e) => setFullstack({ ...fullstack, area: e.target.value })}
            >
              <option>Both / full stack</option>
              <option>Backend API only</option>
              <option>Frontend UI only</option>
              <option>Database change</option>
            </select>
          </label>
          <label>
            What should it do?
            <textarea
              value={fullstack.description}
              onChange={(e) => setFullstack({ ...fullstack, description: e.target.value })}
              placeholder="e.g. a GET /api/profile endpoint returning the logged-in user's name and email"
              rows={3}
              required
            />
          </label>
          <label>
            Additional details <span className="hint">(optional — field names, validation, edge cases)</span>
            <textarea
              value={fullstack.details}
              onChange={(e) => setFullstack({ ...fullstack, details: e.target.value })}
              rows={2}
            />
          </label>
        </>
      )}

      {type === "mobile" && (
        <>
          <label>
            Feature title
            <input
              value={mobile.title}
              onChange={(e) => setMobile({ ...mobile, title: e.target.value })}
              placeholder="e.g. Trip list screen"
              required
            />
          </label>
          <label>
            Screen name <span className="hint">(optional)</span>
            <input
              value={mobile.screen}
              onChange={(e) => setMobile({ ...mobile, screen: e.target.value })}
              placeholder="e.g. TripListScreen"
            />
          </label>
          <label>
            What should it do?
            <textarea
              value={mobile.description}
              onChange={(e) => setMobile({ ...mobile, description: e.target.value })}
              placeholder="e.g. show a scrollable list of the user's past trips"
              rows={3}
              required
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={mobile.needsNetwork}
              onChange={(e) => setMobile({ ...mobile, needsNetwork: e.target.checked })}
            />
            Calls the backend API
          </label>
          {mobile.needsNetwork && (
            <label>
              Which endpoint? <span className="hint">(optional — leave blank and describe it above instead)</span>
              <input
                value={mobile.endpoint}
                onChange={(e) => setMobile({ ...mobile, endpoint: e.target.value })}
                placeholder="e.g. GET /api/trips"
              />
            </label>
          )}
        </>
      )}

      {type === "k8s" && (
        <>
          <label>
            Feature title
            <input
              value={k8s.title}
              onChange={(e) => setK8s({ ...k8s, title: e.target.value })}
              placeholder="e.g. Expose the backend via a LoadBalancer"
              required
            />
          </label>
          <label>
            Resource type
            <select value={k8s.resourceType} onChange={(e) => setK8s({ ...k8s, resourceType: e.target.value })}>
              <option>Deployment</option>
              <option>Service</option>
              <option>ConfigMap</option>
              <option>Secret</option>
              <option>Ingress</option>
              <option>CronJob</option>
              <option>Other</option>
            </select>
          </label>
          {k8s.resourceType === "Deployment" && (
            <label>
              Replicas
              <input
                type="number"
                min="1"
                value={k8s.replicas}
                onChange={(e) => setK8s({ ...k8s, replicas: e.target.value })}
              />
            </label>
          )}
          <label>
            Resource limits <span className="hint">(optional — e.g. "250m CPU / 256Mi memory")</span>
            <input
              value={k8s.resources}
              onChange={(e) => setK8s({ ...k8s, resources: e.target.value })}
              placeholder="leave blank for sensible defaults"
            />
          </label>
          <label>
            What should it do?
            <textarea
              value={k8s.description}
              onChange={(e) => setK8s({ ...k8s, description: e.target.value })}
              placeholder="e.g. add a ConfigMap for the backend's environment variables"
              rows={3}
              required
            />
          </label>
        </>
      )}

      {type === "website" && (
        <>
          <label>
            Feature title
            <input
              value={website.title}
              onChange={(e) => setWebsite({ ...website, title: e.target.value })}
              placeholder="e.g. Add a pricing section"
              required
            />
          </label>
          <label>
            Site name
            <input
              value={website.siteName}
              onChange={(e) => setWebsite({ ...website, siteName: e.target.value })}
              placeholder="e.g. Acme Coffee"
              required
            />
          </label>
          <label>
            Site type
            <select value={website.siteType} onChange={(e) => setWebsite({ ...website, siteType: e.target.value })}>
              {WEBSITE_SITE_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Sections/pages needed <span className="hint">(optional — e.g. "Hero, About, Pricing, Contact")</span>
            <input
              value={website.sections}
              onChange={(e) => setWebsite({ ...website, sections: e.target.value })}
              placeholder="leave blank and describe it below instead"
            />
          </label>
          <label>
            What should it do?
            <textarea
              value={website.description}
              onChange={(e) => setWebsite({ ...website, description: e.target.value })}
              placeholder="e.g. a one-page landing site for a coffee subscription, with a signup form"
              rows={3}
              required
            />
          </label>
          <label>
            Style/tone <span className="hint">(optional — e.g. "modern and minimal, warm earth tones")</span>
            <input
              value={website.style}
              onChange={(e) => setWebsite({ ...website, style: e.target.value })}
              placeholder="leave blank for sensible defaults"
            />
          </label>
        </>
      )}

      {type === "custom" && (
        <>
          {customStreams.length > 0 ? (
            <label>
              Custom stream
              <select value={customStreamId} onChange={(e) => setCustomStreamId(e.target.value)}>
                <option value="">Choose a stream…</option>
                {customStreams.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="empty-state">
              No custom streams yet — register one with "+ New target project" below.
            </p>
          )}
          <label>
            Feature request
            <textarea
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              placeholder="Describe the feature in plain English."
              rows={3}
            />
          </label>
        </>
      )}

      <div className="form-actions">
        <button type="submit" disabled={submitDisabled}>
          {loading === "plan" ? "Asking Claude…" : "Plan this feature"}
        </button>
        <button type="button" className="link-btn" onClick={onToggleNewStream}>
          {showingNewStream ? "Cancel" : "+ New target project"}
        </button>
      </div>
    </form>
  );
}
