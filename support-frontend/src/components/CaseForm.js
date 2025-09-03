// CaseForm.js — FULL REPLACEMENT
import React, { useState, useEffect } from 'react';

const API_BASE =
  (process.env.REACT_APP_API_URL && process.env.REACT_APP_API_URL.replace(/\/+$/, '')) ||
  'https://tekko-cases.onrender.com';

export default function CaseForm({ onCreated }) {
  // Auth
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token') || '';

  // Form state
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');
  const [issueType, setIssueType] = useState('Plans');
  const [priority, setPriority] = useState('Low');
  const [files, setFiles] = useState([]);

  // If your customer search sets these, great; otherwise they default empty and backend handles it.
  const [customerId, setCustomerId] = useState(null);
  const [customerName, setCustomerName] = useState('');

// ---- Customer search UI state ----
const [customerQuery, setCustomerQuery] = useState('');
const [customerOptions, setCustomerOptions] = useState([]);

// Debounced fetch to Square proxy as the user types
useEffect(() => {
  const q = customerQuery.trim();
  if (q.length < 2) { setCustomerOptions([]); return; }

  const ctrl = new AbortController();
  fetch(`${API_BASE}/api/customers/search?q=${encodeURIComponent(q)}`, {
    signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json' },
  })
    .then(r => (r.ok ? r.json() : []))
    .then(list => setCustomerOptions(Array.isArray(list) ? list : []))
    .catch(() => setCustomerOptions([]));

  return () => ctrl.abort();
}, [customerQuery]);

function pickCustomer(c) {
  setCustomerId(c.id || null);
  setCustomerName(c.name || '');
  setCustomerQuery(c.name || '');
  setCustomerOptions([]);
}

  async function handleSubmit(e) {
    e.preventDefault();

    try {
      // Build payload the backend expects
      const payload = {
        title: title.trim(),
        description: description.trim(),
        customerId,
        customerName: customerName || customerQuery,
        issueType,
        priority,
        // agent auto-assigns on the backend from the login token
      };

      // Multipart with "data" JSON + "files"
      const fd = new FormData();
      fd.append('data', JSON.stringify(payload));
      for (const f of files) fd.append('files', f);

      const res = await fetch(`${API_BASE}/cases`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }, // IMPORTANT
        body: fd,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Create case failed');

      // Reset
      setTitle('');
      setPhone('');
      setDescription('');
      setIssueType('Plans');
      setPriority('Low');
      setFiles([]);

      if (typeof onCreated === 'function') onCreated(data);
      alert('Case created');
    } catch (err) {
      alert(`Create case failed: ${err.message || err}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.card}>
      <h3 style={styles.heading}>Create New Case</h3>
{/* Customer details (Square search) */}
<div style={{ position: 'relative', marginTop: 8 }}>
  <label style={styles.label}>Customer details</label>
  <input
    style={styles.input}
    placeholder="Start typing a name, phone, or email"
    value={customerQuery}
    onChange={(e) => {
      setCustomerQuery(e.target.value);
      setCustomerId(null);
      setCustomerName('');
    }}
    autoComplete="off"
  />

  {/* Suggestions dropdown */}
  {customerOptions.length > 0 && (
    <div
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        left: 0,
        right: 0,
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
        zIndex: 9999,
        maxHeight: 240,
        overflowY: 'auto',
      }}
    >
      {customerOptions.map((c) => (
        <button
          key={c.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); pickCustomer(c); }}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '10px 12px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = '#f7f7f7')}
          onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <div style={{ fontWeight: 600 }}>{c.name || 'Unnamed'}</div>
          <div style={{ fontSize: 12, color: '#666' }}>
            {(c.phone || '') + ((c.phone && c.email) ? ' · ' : '') + (c.email || '')}
          </div>
        </button>
      ))}
    </div>
  )}
</div>

      {/* Top row: Title + Phone */}
      <div style={styles.row}>
        <div style={styles.col}>
          <label style={styles.label}>Title</label>
          <input
            style={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short title"
          />
        </div>
        <div style={styles.col}>
          <label style={styles.label}>Phone</label>
          <input
            style={styles.input}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>

      {/* Description LEFT + narrow RIGHT column with Issue type (top) + Priority (below) */}
      <div style={styles.grid2}>
        <div>
          <label style={styles.label}>Description</label>
          <textarea
            style={styles.textarea}
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue"
          />
        </div>

        <div style={styles.sidebar}>
          <div>
            <label style={styles.label}>Issue type</label>
            <select
              style={styles.select}
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
            >
              <option>Plans</option>
              <option>Billing</option>
              <option>Technical</option>
              <option>Activation</option>
              <option>Other</option>
            </select>
          </div>

          <div>
            <label style={styles.label}>Priority</label>
            <select
              style={styles.select}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option>Low</option>
              <option>Normal</option>
              <option>High</option>
              <option>Urgent</option>
            </select>
          </div>
        </div>
      </div>

      {/* Attachments + Submit */}
      <div style={styles.row}>
        <div style={{ ...styles.col, flex: 2 }}>
          <label style={styles.label}>Attachments</label>
          <input
            type="file"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            style={styles.fileSmall}
          />
          {files?.length ? (
            <div style={styles.fileHint}>{files.length} file(s) selected</div>
          ) : null}
        </div>

        <div style={{ ...styles.col, alignSelf: 'end' }}>
          <button type="submit" style={styles.button}>Create Case</button>
        </div>
      </div>

      <div style={styles.subtle}>
        Signed in as <strong>{user?.name || 'Agent'}</strong>
      </div>
    </form>
  );
}

const styles = {
  card: { padding: 20, background: '#fff', borderRadius: 12, boxShadow: '0 6px 20px rgba(0,0,0,0.05)', marginTop: 8 },
  heading: { margin: 0, marginBottom: 10 },
  row: { display: 'flex', gap: 12, marginTop: 8 },
  col: { flex: 1, display: 'grid', gap: 6 },
  label: { fontSize: 13, color: '#555' },
  input: { padding: '10px 12px', border: '1px solid #ddd', borderRadius: 10, fontSize: 15, outline: 'none' },
  textarea: { width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 10, fontSize: 15, resize: 'vertical' },
  select: { padding: '10px 12px', border: '1px solid #ddd', borderRadius: 10, fontSize: 15, width: '100%' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12, alignItems: 'start', marginTop: 8 }, // narrow right column
  sidebar: { display: 'grid', gap: 10 }, // Issue type above Priority
  button: { padding: '10px 14px', borderRadius: 10, border: 'none', background: '#111827', color: '#fff', fontWeight: 600, cursor: 'pointer' },
  fileSmall: { padding: 6, border: '1px dashed #d5d5d8', borderRadius: 10, background: '#fafafa', fontSize: 13, width: '100%' },
  fileHint: { fontSize: 12, color: '#666', marginTop: 6 },
  subtle: { marginTop: 8, color: '#666', fontSize: 13 },
};