/ src/tekko-api.js
const TEKKO_API = process.env.REACT_APP_API_URL;

// Reuse existing authHeaders from src/api.js if it exists; otherwise fallback
const tekkoAuth =
  typeof authHeaders === 'function'
    ? authHeaders
    : () => {
        const t = localStorage.getItem('token') || '';
        return { Authorization: `Bearer ${t}` };
      };

export async function tekkoListCases(view = 'open') {
  const r = await fetch(`${TEKKO_API}/cases?view=${view}`, { headers: tekkoAuth() });
  const j = await r.json().catch(() => ({}));
  return j.items || [];
}

export async function tekkoCreateCase(payload, files = []) {
  const fd = new FormData();
  fd.append('data', JSON.stringify(payload));
  for (const f of files) fd.append('files', f);
  const r = await fetch(`${TEKKO_API}/cases`, { method: 'POST', headers: tekkoAuth(), body: fd });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || 'Create failed');
  }
  return r.json();
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