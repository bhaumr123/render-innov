import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

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
