// One place for "talk to the backend, attach the login token if we have
// one." localStorage persists across page reloads (unlike component
// state), which is exactly what you want for "stay logged in."
export const API_BASE = "http://localhost:4000";

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
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
