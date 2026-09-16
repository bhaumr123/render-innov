// One place for "talk to the backend, attach the login token if we have
// one." localStorage persists across page reloads (unlike component
// state), which is exactly what you want for "stay logged in."
//
// Vite exposes any env var prefixed VITE_ via import.meta.env, baked in at
// build time (not read at runtime — there's no server here to read a real
// env var from, this becomes static JS). Falls back to localhost so local
// dev needs zero configuration; Module 11 sets VITE_API_BASE to the real
// deployed backend URL when building for production.
export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export function getToken() {
  return localStorage.getItem("featureforge_token");
}

export function setToken(token) {
  localStorage.setItem("featureforge_token", token);
}

export function clearToken() {
  localStorage.removeItem("featureforge_token");
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Attaching the status lets a caller tell "your token is bad, log in
    // again" (401) apart from every other kind of failure, without
    // string-matching the error message.
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
