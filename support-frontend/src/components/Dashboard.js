import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api, API_BASE } from './api';             // if your file is under src/pages, use ../api instead
import './Dashboard.css';

const ISSUE_TYPES = ['Product info', 'Plans', 'Rentals', 'Shipping', 'Product support', 'Other'];
const PRIORITIES  = ['Low', 'Medium', 'High'];

export default function Dashboard({ onLogout, user }) {
  // Tabs
  const [tab, setTab] = useState('active'); // active | archived
  const statusForTab = tab === 'active' ? 'Open' : 'Closed';

  // Agents (for filter only)
  const [agents, setAgents] = useState([]);

  // Filters
  const [filters, setFilters] = useState({ q: '', issueType: '', agent: '', priority: '' });
  const [filtersLocal, setFiltersLocal] = useState({ q: '', issueType: '', agent: '', priority: '' });

  // Data & pagination
  const [cases, setCases] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  // Sorting
  const [sort, setSort] = useState({ key: 'caseNumber', dir: 'desc' });
  const sortIndicator = (key) => sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const toggleSort = (key) => setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  // New case
  const [newCase, setNewCase] = useState({
    customerId: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    issueType: '',
    description: '',
    priority: '',
    status: 'Open',
  });
  const [caseFiles, setCaseFiles] = useState([]);

  // Autocomplete (Square) – we try /customers/search first, then /api/customers/search as fallback.
  const [suggestions, setSuggestions] = useState([]);
  const fetchSuggestions = useCallback(async (query) => {
    const val = String(query || '').trim();
    if (val.length < 2) { setSuggestions([]); return; }
    try {
      const r = await api.get('/customers/search', { params: { q: val } });
      setSuggestions(r.data || []);
    } catch {
      try {
        const r2 = await api.get('/api/customers/search', { params: { q: val } });
        setSuggestions(r2.data || []);
      } catch { setSuggestions([]); }
    }
  }, []);

  // Logs drawer
  const [selectedCase, setSelectedCase] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logNote, setLogNote] = useState('');
  const [logFiles, setLogFiles] = useState([]);

  // Loaders
  const loadAgents = useCallback(async () => {
    try {
      const r = await api.get('/agents');           // no /api
      setAgents(r.data || []);
    } catch { setAgents([]); }
  }, []);

  const loadCases = useCallback(async () => {
    const params = { ...filters, status: statusForTab, page, pageSize };
    try {
      const r = await api.get('/cases', { params }); // no /api
      setCases(r.data.items || []);
      setTotal(r.data.total || 0);
    } catch { setCases([]); setTotal(0); }
  }, [filters, page, pageSize, statusForTab]);

  useEffect(() => { loadAgents(); }, [loadAgents]);
  useEffect(() => { loadCases(); }, [loadCases]);
  useEffect(() => { setPage(1); }, [tab]);

  const sortedCases = useMemo(() => {
    const items = [...cases];
    const { key, dir } = sort;
    items.sort((a, b) => {
      const av = a?.[key] ?? '';
      const bv = b?.[key] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return dir === 'asc' ? av - bv : bv - av;
      const A = String(av).toLowerCase(); const B = String(bv).toLowerCase();
      if (A < B) return dir === 'asc' ? -1 : 1;
      if (A > B) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [cases, sort]);

  // Create case (NO /api prefix)
  const createCase = async () => {
    try {
      if (!newCase.customerName || !newCase.issueType || !newCase.priority) {
        alert('Please fill in Customer, Issue type, and Priority.');
        return;
      }
      const payload = { ...newCase, agent: user?.name || '' };
      const fd = new FormData();
      fd.append('data', JSON.stringify(payload));
      (caseFiles || []).forEach(f => fd.append('files', f));

      await api.post('/cases', fd);                 // no /api

      setNewCase({
        customerId: '', customerName: '', customerEmail: '', customerPhone: '',
        issueType: '', description: '', priority: '', status: 'Open'
      });
      setCaseFiles([]);
      if (tab === 'active') await loadCases();
      alert('Case created.');
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.error || err?.message || 'Failed to create case';
      alert('Create case failed: ' + msg);
    }
  };

  // Close / Reopen
  const closeCase = async (id) => {
    try {
      const solutionSummary = window.prompt('Add a brief solution summary before closing:');
      if (!solutionSummary) return;
      await api.put(`/cases/${id}`, { status: 'Closed', solutionSummary }); // no /api
      if (tab === 'active') await loadCases();
    } catch (e) { console.error(e); alert('Failed to close case'); }
  };
  const reopenCase = async (id) => {
    try {
      await api.put(`/cases/${id}`, { status: 'Open' }); // no /api
      setTab('active');
      await loadCases();
    } catch (e) { console.error(e); alert('Failed to reopen case'); }
  };

  // Logs (NO /api prefix)
  const addLog = async () => {
    try {
      if (!selectedCase) return;
      const fd = new FormData();
      fd.append('agent', user?.name || '');         // logged-in user name
      fd.append('note', logNote);
      (logFiles || []).forEach(f => fd.append('files', f));

      const r = await api.post(`/cases/${selectedCase._id}/logs`, fd); // no /api

      setSelectedCase(r.data);
      setLogNote('');
      setLogFiles([]);
      await loadCases();
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.error || err?.message || 'Failed to add log';
      alert('Add log failed: ' + msg);
    }
  };

  // Filters
  function applyFilters(e) { if (e) e.preventDefault(); setFilters(filtersLocal); setPage(1); }
  function resetFilters()   { const empty = { q: '', issueType: '', agent: '', priority: '' }; setFiltersLocal(empty); setFilters(empty); setPage(1); }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="page">
      {/* HEADER with logout */}
      <header className="appbar">
        <div className="brand">Tekko cases</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user && <span className="muted">Signed in as {user.name}</span>}
          {typeof onLogout === 'function' && <button className="btn" onClick={onLogout}>Log out</button>}
        </div>
      </header>

      {/* Create + Filters layout */}
      <div className="layout">
        {/* Create case */}
        <section className="col">
          <div className="card">
            <div className="card-title">Create New Case</div>
            <div className="grid2">
              {/* Customer (autocomplete) */}
              <div className="autocomplete">
                <input
                  placeholder="Customer"
                  value={newCase.customerName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewCase({
                      ...newCase,
                      customerName: val,
                      customerId: '', customerEmail: '', customerPhone: '',
                    });
                    fetchSuggestions(val);
                  }}
                  onBlur={() => setTimeout(() => setSuggestions([]), 200)}
                />
                {suggestions.length > 0 && (
                  <div className="menu">
                    {suggestions.map(s => (
                      <div
                        key={s.id}
                        className="item"
                        onMouseDown={() => {
                          setNewCase({
                            ...newCase,
                            customerId: s.id,
                            customerName: s.name || '',
                            customerEmail: s.email || '',
                            customerPhone: s.phone || ''
                          });
                          setSuggestions([]);
                        }}
                      >
                        <div className="title">{s.name}</div>
                        <div className="sub">{s.email || '—'} · {s.phone || '—'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <input
                placeholder="Contact number (required if new customer)"
                value={newCase.customerPhone}
                onChange={(e) => setNewCase({ ...newCase, customerPhone: e.target.value })}
              />

              <textarea
                placeholder="Description"
                value={newCase.description}
                onChange={e => setNewCase({ ...newCase, description: e.target.value })}
              />

              <select value={newCase.issueType} onChange={e => setNewCase({ ...newCase, issueType: e.target.value })}>
                <option value="">Issue type</option>
                {ISSUE_TYPES.map(x => <option key={x} value={x}>{x}</option>)}
              </select>

              <select value={newCase.priority} onChange={e => setNewCase({ ...newCase, priority: e.target.value })}>
                <option value="">Priority</option>
                {PRIORITIES.map(x => <option key={x} value={x}>{x}</option>)}
              </select>

              <input type="file" multiple onChange={e => setCaseFiles(Array.from(e.target.files || []))} />
            </div>

            {(newCase.customerEmail || newCase.customerPhone) && (
              <div className="muted" style={{ marginTop: 8 }}>
                <b>Customer details:</b> {newCase.customerEmail || '—'} · {newCase.customerPhone || '—'}
              </div>
            )}

            <div className="actions-row">
              <button className="btn primary" onClick={createCase}>Create Case</button>
            </div>
          </div>
        </section>

        {/* Filters & Search */}
        <aside className="col">
          <div className="card">
            <div className="card-title">Filters & Search</div>
            <form onSubmit={applyFilters}>
              <input placeholder="Search (customer, description, logs…)"
                     value={filtersLocal.q}
                     onChange={e => setFiltersLocal({ ...filtersLocal, q: e.target.value })} />

              <select value={filtersLocal.issueType}
                      onChange={e => setFiltersLocal({ ...filtersLocal, issueType: e.target.value })}>
                <option value="">Issue type (all)</option>
                {ISSUE_TYPES.map(x => <option key={x} value={x}>{x}</option>)}
              </select>

              <select value={filtersLocal.agent}
                      onChange={e => setFiltersLocal({ ...filtersLocal, agent: e.target.value })}>
                <option value="">Agent (all)</option>
                {agents.map(a => <option key={a._id || a.name} value={a.name}>{a.name}</option>)}
              </select>

              <select value={filtersLocal.priority}
                      onChange={e => setFiltersLocal({ ...filtersLocal, priority: e.target.value })}>
                <option value="">Priority (all)</option>
                {PRIORITIES.map(x => <option key={x} value={x}>{x}</option>)}
              </select>

              <div className="actions-row">
                <button type="button" className="btn" onClick={resetFilters}>Reset</button>
                <button className="btn primary" type="submit">Search</button>
              </div>
            </form>
          </div>
        </aside>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab==='active' ? 'active' : ''}`} onClick={() => setTab('active')}>Active</button>
        <button className={`tab ${tab==='archived' ? 'active' : ''}`} onClick={() => setTab('archived')}>Archived</button>
      </div>

      {/* Cases table */}
      <div className="card">
        <div className="card-title">{tab === 'active' ? 'Open Cases' : 'Archived Cases'}</div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th className="th-sort" onClick={() => toggleSort('caseNumber')}># {sortIndicator('caseNumber')}</th>
                <th className="th-sort" onClick={() => toggleSort('customerName')}>Customer {sortIndicator('customerName')}</th>
                <th className="th-sort" onClick={() => toggleSort('issueType')}>Issue {sortIndicator('issueType')}</th>
                <th className="th-sort" onClick={() => toggleSort('priority')}>Priority {sortIndicator('priority')}</th>
                <th className="th-sort" onClick={() => toggleSort('agent')}>Agent {sortIndicator('agent')}</th>
                <th className="th-sort" onClick={() => toggleSort('status')}>Status {sortIndicator('status')}</th>
                <th style={{ width: 260 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedCases.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 16, color: '#6b7280' }}>No cases.</td></tr>
              )}
              {sortedCases.map(c => (
                <tr key={c._id}>
                  <td>#{c.caseNumber ?? '—'}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.customerName}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {(c.customerEmail || '—')} · {(c.customerPhone || '—')}
                    </div>
                  </td>
                  <td>{c.issueType}</td>
                  <td><span className={`chip ${String(c.priority).toLowerCase()}`}>{c.priority}</span></td>
                  <td>{c.agent}</td>
                  <td><span className={`chip ${c.status === 'Open' ? 'open' : 'closed'}`}>{c.status}</span></td>
                  <td>
                    <div className="actions-inline">
                      <button className="btn ghost" onClick={() => { setSelectedCase(c); setShowLogs(true); }}>View</button>
                      {c.status !== 'Closed' ? (
                        <button className="btn ghost" onClick={() => closeCase(c._id)}>Close</button>
                      ) : (
                        <button className="btn ghost" onClick={() => reopenCase(c._id)}>Reopen</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="pagination">
          <button className="btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span>
          <button className="btn" disabled={page >= Math.max(1, Math.ceil(total / pageSize))}
                  onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>

      {/* Logs drawer */}
      {showLogs && selectedCase && (
        <div className="drawer">
          <div className="card">
            <div className="drawer-header">
              <div className="card-title">Logs — {selectedCase.customerName}</div>
              <button className="btn" onClick={() => setShowLogs(false)}>Close</button>
            </div>

            <div className="muted" style={{ marginBottom: 8 }}>
              <b>Customer:</b> {selectedCase.customerName} · {selectedCase.customerEmail || '—'} · {selectedCase.customerPhone || '—'}
            </div>

            <div className="grid2">
              {/* Author is always the logged-in user; we hide any dropdown */}
              <input type="file" multiple onChange={e => setLogFiles(Array.from(e.target.files || []))} />
              <textarea placeholder="Note…" value={logNote} onChange={e => setLogNote(e.target.value)} />
            </div>
            <div className="actions-row">
              <button className="btn primary" onClick={addLog}>Add log</button>
            </div>

            <ul className="loglist">
              {selectedCase.logs?.slice().reverse().map((log, i) => (
                <li key={i}>
                  <b>{log.author}</b>
                  <span className="muted"> — {new Date(log.at).toLocaleString()}</span>
                  <div>{log.message}</div>
                  {Array.isArray(log.files) && log.files.length > 0 && (
                    <div className="thumbs">
                      {log.files.map((u, j) => (
                        <a key={j} href={`${API_BASE}${u}`} target="_blank" rel="noreferrer">Attachment {j + 1}</a>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}