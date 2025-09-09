// src/tekko-api.js
const TEKKO_API = process.env.REACT_APP_API_URL;
const tekkoAuth =
  (typeof authHeaders === 'function')
    ? authHeaders
    : () => {
        const t = localStorage.getItem('token') || '';
        return t ? { Authorization: `Bearer ${t}` } : {};
      };

export async function tekkoListCases(view = 'open') {
  const r = await fetch(`${TEKKO_API}/cases?view=${encodeURIComponent(view)}`, {
    headers: tekkoAuth(),
  });
  const j = await r.json().catch(() => ({}));
  // accept either an array or { items: [...] }
  return Array.isArray(j) ? j : (j.items || []);
}

export async function tekkoCreateCase(payload, files = []) {
  const fd = new FormData();
  fd.append('data', JSON.stringify(payload || {}));
  for (const f of files) if (f) fd.append('files', f);

  const r = await fetch(`${TEKKO_API}/cases`, {
    method: 'POST',
    headers: tekkoAuth(), // no Content-Type for FormData
    body: fd,
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Create failed');
  return j;
}

export async function tekkoCloseCase(id) {
  await fetch(`${TEKKO_API}/cases/${id}/close`, { method: 'PATCH', headers: tekkoAuth() });
}
export async function tekkoReopenCase(id) {
  await fetch(`${TEKKO_API}/cases/${id}/reopen`, { method: 'PATCH', headers: tekkoAuth() });
}
export async function tekkoDeleteCase(id) {
  await fetch(`${TEKKO_API}/cases/${id}`, { method: 'DELETE', headers: tekkoAuth() });
}
