// Axios-like API helper that supports api.get/post/etc AND keeps the named helpers.
// Safe drop-in that works with existing imports and older call sites.

const PICK = (v) => (typeof v === "string" ? v.replace(/\/+$/, "") : v);

// Allow either REACT_APP_API_BASE or REACT_APP_API_URL
export const API_BASE =
  PICK(process.env.REACT_APP_API_BASE) ||
  PICK(process.env.REACT_APP_API_URL) ||
  "https://tekko-cases.onrender.com";

const TIMEOUT = Number(process.env.REACT_APP_API_TIMEOUT || 15000);

function authHeaders() {
  const token = localStorage.getItem("token") || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Map old paths to new ones (so legacy calls still work)
function rewritePath(path = "") {
  // If any code still calls '/customers/search', rewrite to our backend proxy
  if (path === "/customers/search" || path.startsWith("/customers/search?")) {
    return path.replace("/customers/search", "/api/customers/search");
  }
  return path;
}

function withParams(url, params) {
  if (!params || typeof params !== "object") return url;
  const u = new URL(url, API_BASE);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
  });
  return u.pathname.startsWith("http") ? u.toString() : u.href;
}

async function request(method, path, { params, data, headers } = {}) {
  const rel = rewritePath(path || "");
  const url =
    rel.startsWith("http")
      ? withParams(rel, params)
      : withParams(`${API_BASE}${rel.startsWith("/") ? "" : "/"}${rel}`, params);

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT);

  const opts = {
    method,
    headers: { ...authHeaders(), ...(headers || {}) },
    signal: controller.signal,
  };

  // Body handling
  if (data instanceof FormData) {
    opts.body = data; // do NOT set Content-Type
  } else if (data !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(data);
  }

  try {
    const res = await fetch(url, opts);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || json?.message || `${res.status}`);
    return json;
  } finally {
    clearTimeout(id);
  }
}

// Axios-like surface
const http = {
  get: (path, config = {}) => request("GET", path, config),
  delete: (path, config = {}) => request("DELETE", path, config),
  post: (path, data, config = {}) => request("POST", path, { ...config, data }),
  put: (path, data, config = {}) => request("PUT", path, { ...config, data }),
  patch: (path, data, config = {}) => request("PATCH", path, { ...config, data }),
};

/* ===========================
   Named helper functions
=========================== */

export async function loginByName({ username, password }) {
  const data = await http.post("/login-name", { username, password });
  if (data?.token) localStorage.setItem("token", data.token);
  if (data?.user) localStorage.setItem("user", JSON.stringify(data.user));
  return data;
}

export async function searchCustomers(q) {
  if (!q) return [];
  const qs = encodeURIComponent(q || "");

  // Use env base (no trailing slash), then try both endpoints; final hard fallback.
  const base = (API_BASE || "https://tekko-cases.onrender.com").replace(/\/+$/, "");

  const urls = [
    `${base}/api/customers/search?q=${qs}`,   // primary
    `${base}/customers/search?q=${qs}`,       // fallback (also supported)
    `https://tekko-cases.onrender.com/api/customers/search?q=${qs}`, // last-resort
  ];

  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { "Content-Type": "application/json" } });
      if (r.ok) return await r.json();
    } catch (_) {
      /* try next url */
    }
  }
  return [];
}

export async function listCases() {
  return await http.get("/cases");
}

export async function createCase(
  { title, description, customerId, customerName, issueType, priority },
  files = []
) {
  const payload = {
    title: title || "",
    description: description || "",
    customerId: customerId ?? null,
    customerName: customerName || "",
    issueType: issueType || "Other",
    priority: priority || "Normal",
  };

  const fd = new FormData();
  fd.append("data", JSON.stringify(payload));
  (files || []).forEach((f) => f && fd.append("files", f));

  return await http.post("/cases", fd);
}

export async function addLog(caseId, note, files = []) {
  const fd = new FormData();
  fd.append("note", note || "");
  (files || []).forEach((f) => f && fd.append("files", f));
  return await http.post(`/cases/${caseId}/logs`, fd);
}

// Default export is the axios-like object, but also include helpers on it:
const api = Object.assign({}, http, {
  API_BASE,
  loginByName,
  searchCustomers,
  listCases,
  createCase,
  addLog,
});

// Provide BOTH a default export and a named `api` so any import style works.
export { api };
export default api;