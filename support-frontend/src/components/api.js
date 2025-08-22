const API_BASE = 'http://localhost:5000/api';

// ---------- Cases ----------
export async function fetchCases(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k,v]) => v && params.append(k, v));
  const qs = params.toString();
  const r = await fetch(`${API_BASE}/cases${qs ? `?${qs}` : ''}`);
  if (!r.ok) throw new Error('Failed to fetch cases');
  return r.json();
}

export async function createCase(data) {
  const r = await fetch(`${API_BASE}/cases`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error((await r.json()).error || 'Failed to create case');
  return r.json();
}

export async function updateCase(id, data) {
  const r = await fetch(`${API_BASE}/cases/${id}`, {
    method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error((await r.json()).error || 'Failed to update case');
  return r.json();
}

export async function deleteCase(id) {
  const r = await fetch(`${API_BASE}/cases/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error('Failed to delete case');
  return r.json();
}

// ---------- Uploads ----------
export async function uploadFiles(fileList) {
  const form = new FormData();
  [...fileList].forEach(f => form.append('files', f));
  const r = await fetch(`${API_BASE}/upload`, { method: 'POST', body: form });
  if (!r.ok) throw new Error('Upload failed');
  return r.json(); // { urls: [...] }
}

// ---------- Logs ----------
export async function fetchLogs(caseId) {
  const r = await fetch(`${API_BASE}/cases/${caseId}/logs`);
  if (!r.ok) throw new Error('Failed to fetch logs');
  return r.json();
}

export async function addLog(caseId, data) {
  const r = await fetch(`${API_BASE}/cases/${caseId}/logs`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error((await r.json()).error || 'Failed to add log');
  return r.json();
}

export async function deleteLog(caseId, logId) {
  const r = await fetch(`${API_BASE}/cases/${caseId}/logs/${logId}`, { method: 'DELETE' });
  if (!r.ok) throw new Error('Failed to delete log');
  return r.json();
}