import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Must match backend SESSION_SUPERSEDED_DETAIL exactly (backend/server.py).
export const SESSION_SUPERSEDED_DETAIL = "Session ended — you're signed in from another device.";

// One active session per account (buyer/seller — admin is exempt): logging
// in elsewhere invalidates this browser's session. Any request can surface
// that as a 401 with this exact message, not just the next page load — catch
// it globally so the user lands on a login screen that explains why, instead
// of a confusing failure on whatever action they happened to be doing.
let redirectingForSupersededSession = false;
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isSuperseded = err?.response?.status === 401 && err.response?.data?.detail === SESSION_SUPERSEDED_DETAIL;
    if (isSuperseded && !redirectingForSupersededSession && !window.location.pathname.startsWith("/login")) {
      redirectingForSupersededSession = true;
      window.location.assign("/login?reason=session_replaced");
    }
    return Promise.reject(err);
  }
);

// Uploaded files (product pictures, QR codes) are returned as a relative
// "/uploads/.." path when Cloudinary isn't configured; resolve those against
// the API's own origin so <img> tags load correctly. Cloudinary URLs are
// already absolute and pass through unchanged.
export function resolveUploadUrl(path) {
  return path && path.startsWith("/") ? `${BACKEND_URL}${path}` : path;
}

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

/**
 * Convert an axios error into a friendly, actionable string.
 * Distinguishes between "server not reachable" and "server returned an error"
 * so users on cPanel see something more useful than "Something went wrong".
 */
export function formatApiError(err) {
  // No response object at all -> network failure or CORS block
  if (!err?.response) {
    if (err?.code === "ERR_NETWORK") return "Cannot reach the server. Please check your internet or try again in a moment.";
    return err?.message || "Cannot reach the server. Please try again.";
  }
  const { status, data } = err.response;
  // Server returned HTML (e.g. Apache default 404) instead of a JSON API error
  if (typeof data === "string" && data.trim().startsWith("<")) {
    if (status === 404) return "Service is not available right now. Please try again shortly.";
    return `Server error (${status}). Please try again.`;
  }
  if (data && data.detail != null) return formatApiErrorDetail(data.detail);
  return `Request failed (${status}). Please try again.`;
}

export default api;
