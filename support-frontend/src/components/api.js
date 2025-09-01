// support-frontend/src/components/api.js
const API_BASE =
  (process.env.REACT_APP_API_URL && process.env.REACT_APP_API_URL.replace(/\/+$/, '')) ||
  'https://tekko-cases.onrender.com';

function authHeaders() {
  const token = localStorage.getItem('token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---- AUTH ----
export async function loginByName({ username, password }) {
  const res = await fetch(`${API_BASE}/login-name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Login failed');
  localStorage.setItem('token', data.token || '');
  localStorage.setItem('user', JSON.stringify(data.user || {}));
  return data;
}

// ---- SQUARE ----
export async function searchCustomers(q) {
  const res = await fetch(`${API_BASE}/api/customers/search?q=${encodeURIComponent(q)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Customer search failed');
  return data; // [{id,name,phone,email}]
}

// ---- CASES ----
export async function listCases() {
  const res = await fetch(`${API_BASE}/cases`, { headers: { ...authHeaders() } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'List cases failed');
  return data;
}

export async function createCase({ title, description, customerId, customerName, issueType, priority }, files = []) {
  const fd = new FormData();
  const payload = {
    title: title || '',
    description: description || '',
    customerId: customerId || null,
    customerName: customerName || '',
    issueType: issueType || 'Other',
    priority: priority || 'Normal',
    // agent will be set on the backend from your login token
  };
  fd.append('data', JSON.stringify(payload));
  (files || []).forEach((f) => fd.append('files', f));

  const res = await fetch(`${API_BASE}/cases`, {
    method: 'POST',
    headers: { ...authHeaders() }, // IMPORTANT: Bearer token only – no Content-Type for FormData
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Create case failed');
  return data;
}

export async function addLog(caseId, note, files = []) {
  const fd = new FormData();
  fd.append('note', note || '');
  (files || []).forEach((f) => fd.append('files', f));

  const res = await fetch(`${API_BASE}/cases/${caseId}/logs`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Add log failed');
  return data;
}