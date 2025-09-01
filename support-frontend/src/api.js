// support-frontend/src/api.js
// Unified API helper used across the app.
// Exports BOTH a default and a *named* `api` to satisfy any import style.

const PICK = (v) => (typeof v === "string" ? v.replace(/\/+$/, "") : v);

// Allow either REACT_APP_API_BASE or REACT_APP_API_URL
const API_BASE =
  PICK(process.env.REACT_APP_API_BASE) ||
  PICK(process.env.REACT_APP_API_URL) ||
  "https://tekko-cases.onrender.com";

// Optional timeout (ms)
const TIMEOUT = Number(process.env.REACT_APP_API_TIMEOUT || 15000);

function authHeaders() {
  const token = localStorage.getItem("token") || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJSON(url, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || data?.message || `${res.status}`);
    return data;
  } finally {
    clearTimeout(id);
  }
}

/* ===========================
   AUTH
=========================== */

export async function loginByName({ username, password }) {
  const data = await fetchJSON(`${API_BASE}/login-name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (data?.token) localStorage.setItem("token", data.token);
  if (data?.user) localStorage.setItem("user", JSON.stringify(data.user));
  return data;
}

/* ===========================
   SQUARE
=========================== */

export async function searchCustomers(q) {
  const url = `${API_BASE}/api/customers/search?q=${encodeURIComponent(q || "")}`;
  return await fetchJSON(url);
}

/* ===========================
   CASES
=========================== */

export async function listCases() {
  const res = await fetch(`${API_BASE}/cases`, {
    headers: { ...authHeaders() },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "List cases failed");
  return data;
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
    // agent is set on the backend from the login token
  };

  const fd = new FormData();
  fd.append("data", JSON.stringify(payload));
  (files || []).forEach((f) => f && fd.append("files", f));

  const res = await fetch(`${API_BASE}/cases`, {
    method: "POST",
    headers: { ...authHeaders() }, // DO NOT set Content-Type for FormData
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Create case failed");
  return data;
}

export async function addLog(caseId, note, files = []) {
  const fd = new FormData();
  fd.append("note", note || "");
  (files || []).forEach((f) => f && fd.append("files", f));

  const res = await fetch(`${API_BASE}/cases/${caseId}/logs`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Add log failed");
  return data;
}

// Provide BOTH a default export and a *named* export called `api`
const api = { loginByName, searchCustomers, listCases, createCase, addLog };
export { api, API_BASE };   // ← add API_BASE here too
export default api;
