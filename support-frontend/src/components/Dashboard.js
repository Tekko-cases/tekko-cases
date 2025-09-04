import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api, API_BASE } from './api';
import './Dashboard.css';

const ISSUE_TYPES = ['Product info', 'Plans', 'Rentals', 'Shipping', 'Product support', 'Other'];
const PRIORITIES  = ['Low', 'Medium', 'High'];

export default function Dashboard({ onLogout, user }) {
  // Top nav: create | filters | cases
  const [screen, setScreen] = useState('cases'); // 'create' | 'filters' | 'cases'

  // Tabs inside Cases: active | archived
  const [tab, setTab] = useState('active');
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
  const [extraPhones, setExtraPhones] = useState([]); // subtle extra numbers
  const [caseFiles, setCaseFiles] = useState([]);

  // Square autocomplete (stays on /api/customers/search)
  const [suggestions, setSuggestions] = useState([]);
  const fetchSuggestions = useCallback(async (query) => {
    const val = String(query || '').trim();
    if (val.length < 2) { setSuggestions([]); return; }
    try {
      const r = await api.get('/api/customers/search', { params: { q: val } });
      setSuggestions(Array.isArray(r) ? r : (r?.data || []));
    } catch {
      setSuggestions([]);
    }
  }, []);

  // Logs inline under a case row
  const [expandedCase, setExpandedCase] = useState(null);
  const [logNote, setLogNote] = useState('');
  const [logFiles, setLogFiles] = useState([]);

  const loadAgents = useCallback(async () => {
    try {
      const r = await api.get('/api/agents');
      setAgents(r.data || []);
    } catch { setAgents([]); }
  }, []);

  const loadCases = useCallback(async () => {
    const params = { ...filters, status: statusForTab, page, pageSize };
    try {
      // ✅ correct path (no /api)
      const r = await api.get('/cases', { params });
      setCases(r.data?.items || r.items || []);
      setTotal(r.data?.total ?? r.total ?? 0);
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

  // Create case — agent = logged-in user; phone required if new customer
  const createCase = async () => {
    try {
      if (!newCase.customerName || !newCase.issueType || !newCase.priority) {
        alert('Please fill in Customer, Issue type, and Priority.');
        return;
      }
      const allPhones = [newCase.customerPhone, ...extraPhones].map(s => String(s || '').trim()).filter(Boolean);
      if (!newCase.customerId && allPhones.length === 0) {
        alert('Please enter a contact number for new customers.');
        return;
      }

      const payload = {
        ...newCase,
        agent: user?.name || '',
        customerPhone: allPhones.join(', ')
      };
      const fd = new FormData();
      fd.append('data', JSON.stringify(payload));
      (caseFiles || []).forEach(f => fd.append('files', f));

      // ✅ correct path (no /api)
      await api.post('/cases', fd);

      setNewCase({
        customerId: '', customerName: '', customerEmail: '', customerPhone: '',
        issueType: '', description: '', priority: '', status: 'Open'
      });
      setExtraPhones([]);
      setCaseFiles([]);
      setScreen('cases');
      await loadCases();
      alert('Case created.');
    } catch (err) {
      console.error(err);
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        'Failed to create case';
      alert('Create case failed: ' + msg);
    }
  };

  const closeCase = async (id) => {
    try {
      const solutionSummary = window.prompt('Add a brief solution summary before closing:');
      if (!solutionSummary) return;
      // ✅ correct path (no /api)
      await api.put(`/cases/${id}`, { status: 'Closed', solutionSummary });
      await loadCases();
    } catch (e) { console.error(e); alert('Failed to close case'); }
  };

  const reopenCase = async (id) => {
    try {
      // ✅ correct path (no /api)
      await api.put(`/cases/${id}`, { status: 'Open' });
      setTab('active');
      await loadCases();
    } catch (e) { console.error(e); alert('Failed to reopen case'); }
  };

  const addLog = async () => {
    try {
      if (!expandedCase) return;
      const fd = new FormData();
      fd.append('agent', user?.name || '');
      fd.append('note', logNote);
      (logFiles || []).forEach(f => fd.append('files', f));
      // ✅ correct path (no /api)
      const r = await api.post(`/cases/${expandedCase._id}/logs`, fd);
      setExpandedCase(r.data || r); // refresh inline case
      setLogNote('');
      setLogFiles([]);
      await loadCases();
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.error || err?.message || 'Failed to add log';
      alert('Add log failed: ' + msg);
    }
  };

  function applyFilters(e) { if (e) e.preventDefault(); setFilters(filtersLocal); setPage(1); setScreen('cases'); }
  function resetFilters()   { const empty = { q: '', issueType: '', agent: '', priority: '' }; setFiltersLocal(empty); setFilters(empty); setPage(1); }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const Nav = () => (
    <nav style={{ display:'flex', gap:8, alignItems:'center' }}>
      <button className={`btn ${screen==='create' ? 'primary' : ''}`} onClick={() => setScreen('create')}>Create case</button>
      <button className={`btn ${screen==='filters' ? 'primary' : ''}`} onClick={() => setScreen('filters')}>Filters & Search</button>
      <button className={`btn ${screen==='cases' ? 'primary' : ''}`} onClick={() => setScreen('cases')}>Cases</button>
      <div style={{ flex:1 }} />
      {user && <span className="muted">Signed in as {user.name}</span>}
      {typeof onLogout === 'function' && <button className="btn" onClick={onLogout}>Log out</button>}
    </nav>
  );

  return (
    <div className="page">
      {/* HEADER */}
      <header className="appbar">
        <div className="brand">Tekko cases</div>
        <Nav />
      </header>

      {/* CREATE */}
      {screen === 'create' && (
        <section className="col" style={{ maxWidth: 900, margin: '12px auto' }}>
          <div className="card">
            <div className="card-title">Create New Case</div>
            <div className="grid2">
              {/* Customer (Square autocomplete) */}
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

              {/* Primary number (required if new customer) */}
              <input
                placeholder="Contact number (required if new customer)"
                value={newCase.customerPhone}
                onChange={(e) => setNewCase({ ...newCase, customerPhone: e.target.value })}
              />

              {/* Subtle extra numbers */}
              <div style={{ gridColumn: '1 / -1' }}>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: 0, fontSize: 12, background: 'transparent', textDecoration: 'underline' }}
                  onClick={() => setExtraPhones(p => [...p, ''])}
                >
                  + Add another number
                </button>
                {extraPhones.map((ph, i) => (
                  <input
                    key={i}
                    placeholder={`Extra number ${i+1}`}
                    value={ph}
                    onChange={e => {
                      const copy = [...extraPhones];
                      copy[i] = e.target.value;
                      setExtraPhones(copy);
                    }}
                    style={{ marginTop: 6, fontSize: 12, padding: '6px 8px' }}
                  />
                ))}
              </div>

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

            {(newCase.customerEmail || newCase.customerPhone || extraPhones.length > 0) && (
              <div className="muted" style={{ marginTop: 8 }}>
                <b>Customer details:</b> {newCase.customerEmail || '—'} · {[newCase.customerPhone, ...extraPhones].filter(Boolean).join(', ') || '—'}
              </div>
            )}

            <div className="actions-row">
              <button className="btn primary" onClick={createCase}>Create Case</button>
            </div>
          </div>
        </section>
      )}

      {/* FILTERS */}
      {screen === 'filters' && (
        <section className="col" style={{ maxWidth: 700, margin: '12px auto' }}>
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
                <button className="btn primary" type="submit">Apply</button>
              </div>
            </form>
          </div>
        </section>
      )}

      {/* CASES */}
      {screen === 'cases' && (
        <>
          <div className="tabs" style={{ maxWidth: 1100, margin: '8px auto' }}>
            <button className={`tab ${tab==='active' ? 'active' : ''}`} onClick={() => setTab('active')}>Open</button>
            <button className={`tab ${tab==='archived' ? 'active' : ''}`} onClick={() => setTab('archived')}>Archived</button>
          </div>

          <section className="col" style={{ maxWidth: 1100, margin: '0 auto' }}>
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
                      <th style={{ width: 220 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCases.length === 0 && (
                      <tr><td colSpan={7} style={{ padding: 16, color: '#6b7280' }}>No cases.</td></tr>
                    )}
                    {sortedCases.map(c => {
                      const expanded = expandedCase && expandedCase._id === c._id;
                      return (
                        <React.Fragment key={c._id}>
                          <tr>
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
                                <button
                                  className="btn ghost"
                                  onClick={() => setExpandedCase(expanded ? null : c)}
                                >
                                  {expanded ? 'Hide' : 'View'}
                                </button>
                                {c.status !== 'Closed'
                                  ? <button className="btn ghost" onClick={() => closeCase(c._id)}>Close</button>
                                  : <button className="btn ghost" onClick={() => reopenCase(c._id)}>Reopen</button>}
                              </div>
                            </td>
                          </tr>

                          {/* Inline logs row */}
                          {expanded && (
                            <tr>
                              <td colSpan={7} style={{ background: '#fafafa' }}>
                                <div className="card" style={{ margin: '8px 0' }}>
                                  <div className="card-title">Logs — {c.customerName}</div>

                                  <div className="muted" style={{ marginBottom: 8 }}>
                                    <b>Customer:</b> {c.customerName} · {c.customerEmail || '—'} · {c.customerPhone || '—'}
                                  </div>

                                  <div className="grid2">
                                    <input type="file" multiple onChange={e => setLogFiles(Array.from(e.target.files || []))} />
                                    <textarea placeholder="Note…" value={logNote} onChange={e => setLogNote(e.target.value)} />
                                  </div>
                                  <div className="actions-row">
                                    <button className="btn primary" onClick={addLog}>Add log</button>
                                  </div>

                                  <ul className="loglist">
                                    {(expandedCase.logs || []).slice().reverse().map((log, i) => (
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
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
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
          </section>
        </>
      )}
    </div>
  );
}