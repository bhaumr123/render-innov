// The studio's home screen. One card per build type — the three built-in
// ones are fixed, "Custom streams" summarizes whatever's been registered
// at runtime. Counts come from the history you already loaded (grouped
// here, client-side) rather than a new backend endpoint — the data was
// already in hand.
const BUILT_IN_CARDS = [
  {
    type: "fullstack",
    icon: "🧩",
    title: "Full-Stack",
    description: "Backend API, frontend, database — the app itself.",
  },
  {
    type: "mobile",
    icon: "📱",
    title: "Mobile (Android)",
    description: "Native Kotlin + Gradle client.",
  },
  {
    type: "k8s",
    icon: "☸️",
    title: "Kubernetes",
    description: "Deployment manifests, Dockerfiles, Services.",
  },
];

function summarize(history) {
  const counts = {};
  const latest = {};
  for (const h of history) {
    const key = ["fullstack", "mobile", "k8s"].includes(h.stream) ? h.stream : "custom";
    counts[key] = (counts[key] || 0) + 1;
    if (!latest[key] || new Date(h.createdAt) > new Date(latest[key])) {
      latest[key] = h.createdAt;
    }
  }
  return { counts, latest };
}

function BuildCard({ icon, title, description, count, lastBuiltAt, onClick }) {
  return (
    <button type="button" className="build-card" onClick={onClick}>
      <span className="build-card__icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="build-card__meta">
        {count > 0
          ? `${count} build${count === 1 ? "" : "s"} · last ${new Date(lastBuiltAt).toLocaleDateString()}`
          : "No builds yet"}
      </span>
    </button>
  );
}

export default function Dashboard({ streams, history, onStartBuild }) {
  const { counts, latest } = summarize(history);
  const customStreams = streams.filter((s) => s.custom);

  return (
    <div className="dashboard-grid">
      {BUILT_IN_CARDS.map((c) => (
        <BuildCard
          key={c.type}
          icon={c.icon}
          title={c.title}
          description={c.description}
          count={counts[c.type] || 0}
          lastBuiltAt={latest[c.type]}
          onClick={() => onStartBuild(c.type)}
        />
      ))}

      <button type="button" className="build-card build-card--custom" onClick={() => onStartBuild("custom")}>
        <span className="build-card__icon">🛠️</span>
        <h3>Custom streams</h3>
        <p>
          {customStreams.length > 0
            ? customStreams.map((s) => s.label).join(", ")
            : "Register your own target project for anything the built-in types don't cover."}
        </p>
        <span className="build-card__meta">
          {counts.custom > 0
            ? `${counts.custom} build${counts.custom === 1 ? "" : "s"} · last ${new Date(latest.custom).toLocaleDateString()}`
            : customStreams.length > 0
              ? "No builds yet"
              : "None registered yet"}
        </span>
      </button>
    </div>
  );
}
