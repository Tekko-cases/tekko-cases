import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api, API_BASE } from '../api';
import './Dashboard.css';

const ISSUE_TYPES = ['Product info', 'Plans', 'Rentals', 'Shipping', 'Product support', 'Other'];
const PRIORITIES = ['Low', 'Medium', 'High'];

export default function Dashboard({ onLogout, user }) {
  // ------- Top navigation view -------
  const [view, setView] = useState('cases'); // 'create' | 'filters' | 'cases'
  const [tab, setTab] = useState('active');  // active | archived
  const statusForTab = tab === 'active' ? 'Open' : 'Closed';

  // Agents (for filter list only)
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

  // New case (manual customer options)
  const [newCase, setNewCase] = useState({
    customerId: '', customerName: '', customerEmail: '', customerPhone: '',
    issueType: '', description: '', priority: '', agent: '', status: 'Open'
  });
  const [extraPhones, setExtraPhones] = useState([]);
  const [caseFiles, setCaseFiles] = useState([]);

  // Customer suggestions (Tekko)
  const [suggestions, setSuggestions] = useState([]);
  const fetchSuggestions = useCallback(async (query) => {
    const val = String(query || '').trim();
    if (val.length < 2) { setSuggestions([]); return; }
    try {
      const r = await api.get('/api/customers/search', { params: { q: val } });
      setSuggestions(r.data || []);
    } catch { setSuggestions([]); }
  }, []);

  // Inline logs under a case row
  const [selectedCase, setSelectedCase] = useState(null);
  const [logNote, setLogNote] = useState('');
  const [logFiles, setLogFiles] = useState([]);

  // Load
  const loadAgents = useCallback(async () => {
    const r = await api.get('/api/agents');
    setAgents(r.data);
  }, []);
  const loadCases = useCallback(async () => {
    const params = { ...filters, status: statusForTab, page, pageSize };
    const r = await api.get('/api/cases', { params });
    setCases(r.data.items);
    setTotal(r.data.total);
    // refresh expanded row if open
    if (selectedCase) {
      const updated = r.data.items.find(x => x._id === selectedCase._id);
      if (updated) setSelectedCase(updated);
    }
  }, [filters, page, pageSize, statusForTab, selectedCase]);

  useEffect(() => { loadAgents(); }, [loadAgents]);
  useEffect(() => { loadCases(); }, [loadCases]);
  useEffect(() => { setPage(1); }, [tab]);

  // Sorting
  function toggleSort(key) {
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }
  const sortIndicator = (key) => sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';

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

  // Create case (with required phone for new customers + extra numbers)
  const createCase = async () => {
    if (!newCase.customerName || !newCase.issueType || !newCase.priority) {
      alert('Please fill in Customer, Issue type, and Priority.');
      return;
    }
    const isNewCustomer = !newCase.customerId && String(newCase.customerName || '').trim().length > 0;
    if (isNewCustomer && !String(newCase.customerPhone || '').trim()) {
      alert('Please enter a contact number for a new customer.');
      return;
    }
    const phones = [newCase.customerPhone, ...extraPhones].map(s => String(s || '').trim()).filter(Boolean);
    const payload = { ...newCase, customerPhone: phones.join(', '), agent: user?.name || '' };

    const fd = new FormData();
    fd.append('data', JSON.stringify(payload));
    (caseFiles || []).forEach(f => fd.append('files', f));
    await api.post('/api/cases', fd);

    setNewCase({ customerId:'', customerName:'', customerEmail:'', customerPhone:'', issueType:'', description:'', priority:'', status:'Open' });
    setExtraPhones([]); setCaseFiles([]);
    setView('cases'); // go to list after creating
    loadCases();
  };

  // Close / Reactivate
  const closeCase = async (id) => {
    const solutionSummary = window.prompt('Add a brief solution summary before closing:');
    if (!solutionSummary) return;
    await api.put(`/api/cases/${id}`, { status: 'Closed', solutionSummary });
    loadCases();
  };
  const reactivateCase = async (id) => {
    await api.put(`/api/cases/${id}`, { status: 'Open' });
    loadCases();
  };

  // Logs
  const addLog = async () => {
    if (!selectedCase) return;
    const fd = new FormData();
    fd.append('note', logNote); // server sets author from JWT user
    (logFiles || []).forEach(f => fd.append('files', f));
    const r = await api.post(`/api/cases/${selectedCase._id}/logs`, fd);
    setSelectedCase(r.data);
    setLogNote(''); setLogFiles([]);
    loadCases();
  };

  function applyFilters(e){ if(e) e.preventDefault(); setFilters(filtersLocal); setPage(1); setView('cases'); }
  function resetFilters(){ const empty={q:'', issueType:'', agent:'', priority:''}; setFiltersLocal(empty); setFilters(empty); setPage(1); }

  const toggleViewRow = (caseObj) => {
    setSelectedCase(prev => (prev && prev._id === caseObj._id ? null : caseObj));
    setLogNote(''); setLogFiles([]);
  };

  // ---------- UI ----------
  return (
    <div className="page">
      {/* Top navigation */}
      <div className="topnav">
        <div className="brand">Tekko Cases</div>
        <div className="navlinks">
          <button className={`navlink ${view==='create'?'active':''}`} onClick={()=>setView('create')}>Create Case</button>
          <button className={`navlink ${view==='filters'?'active':''}`} onClick={()=>setView('filters')}>Filters</button>
          <button className={`navlink ${view==='cases'?'active':''}`} onClick={()=>setView('cases')}>Cases</button>
          {typeof onLogout === 'function' && (
            <button className="navlink" onClick={onLogout}>Logout</button>
          )}
        </div>
      </div>

      {/* CREATE VIEW */}
      {view === 'create' && (
        <section className="col">
          <div className="card">
            <div className="card-title">Create New Case</div>
            <div className="grid2">
              {/* Customer with suggestions */}
              <div className="autocomplete">
                <input
                  placeholder="Customer"
                  value={newCase.customerName}
                  onChange={(e)=>{
                    const val=e.target.value;
                    setNewCase({...newCase, customerName:val, customerId:'', customerEmail:'', customerPhone:''});
                    fetchSuggestions(val);
                  }}
                  onBlur={()=>setTimeout(()=>setSuggestions([]),200)}
                />
                {suggestions.length>0 && (
                  <div className="menu">
                    {suggestions.map(s=>(
                      <div key={s.id} className="item" onMouseDown={()=>{
                        setNewCase({
                          ...newCase,
                          customerId:s.id,
                          customerName:s.name||'',
                          customerEmail:s.email||'',
                          customerPhone:s.phone||''
                        });
                        setSuggestions([]);
                      }}>
                        <div className="title">{s.name}</div>
                        <div className="sub">{s.email || '—'} · {s.phone || '—'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Main phone (required for new customers) */}
              <input
                placeholder="Contact number (required if new customer)"
                value={newCase.customerPhone}
                onChange={e=>setNewCase({...newCase, customerPhone:e.target.value})}
              />

              {/* Extra numbers (subtle/compact) */}
              {extraPhones.map((p, idx)=>(
                <div key={idx} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, opacity:.9 }}>
                  <input
                    placeholder={`Additional number ${idx+1}`}
                    value={p}
                    onChange={e=>{
                      const copy=[...extraPhones]; copy[idx]=e.target.value; setExtraPhones(copy);
                    }}
                    style={{ flex:1, padding:'4px 6px', fontSize:12 }}
                  />
                  <button type="button"
                          onClick={()=>setExtraPhones(extraPhones.filter((_,i)=>i!==idx))}
                          style={{ padding:0, border:'none', background:'none', color:'#2563eb', textDecoration:'underline', cursor:'pointer', fontSize:12 }}>
                    × remove
                  </button>
                </div>
              ))}
              <button type="button"
                      onClick={()=>setExtraPhones([...extraPhones,''])}
                      style={{ padding:0, border:'none', background:'none', color:'#2563eb', textDecoration:'underline', cursor:'pointer', fontSize:12, alignSelf:'start' }}>
                + Add another number
              </button>

              <select value={newCase.issueType} onChange={e=>setNewCase({...newCase, issueType:e.target.value})}>
                <option value="">Issue type</option>
                {ISSUE_TYPES.map(x => <option key={x} value={x}>{x}</option>)}
              </select>

              <textarea placeholder="Description" value={newCase.description}
                        onChange={e=>setNewCase({...newCase, description:e.target.value})} />

              <select value={newCase.priority} onChange={e=>setNewCase({...newCase, priority:e.target.value})}>
                <option value="">Priority</option>
                {PRIORITIES.map(x => <option key={x} value={x}>{x}</option>)}
              </select>

              <input type="file" multiple onChange={e=>setCaseFiles(Array.from(e.target.files || []))} />
            </div>

            {(newCase.customerEmail || newCase.customerPhone || extraPhones.some(Boolean)) && (
              <div className="muted" style={{ marginTop:8, fontSize:12 }}>
                <b>Customer details:</b> {newCase.customerEmail || '—'} · {newCase.customerPhone || '—'}
                {extraPhones.filter(Boolean).length>0 && <span> · {extraPhones.filter(Boolean).join(', ')}</span>}
              </div>
            )}

            <div className="actions-row">
              <button className="btn primary" onClick={createCase}>Create Case</button>
            </div>
          </div>
        </section>
      )}

      {/* FILTERS VIEW */}
      {view === 'filters' && (
        <aside className="col">
          <div className="card">
            <div className="card-title">Filters</div>
            <form onSubmit={applyFilters}>
              <input placeholder="Search (customer, description, logs…)"
                     value={filtersLocal.q}
                     onChange={e=>setFiltersLocal({...filtersLocal, q:e.target.value})} />

              <div className="grid2">
                <select value={filtersLocal.issueType} onChange={e=>setFiltersLocal({...filtersLocal, issueType:e.target.value})}>
                  <option value="">Issue type (all)</option>
                  {ISSUE_TYPES.map(x => <option key={x} value={x}>{x}</option>)}
                </select>

                <select value={filtersLocal.priority} onChange={e=>setFiltersLocal({...filtersLocal, priority:e.target.value})}>
                  <option value="">Priority (all)</option>
                  {PRIORITIES.map(x => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>

              <select value={filtersLocal.agent} onChange={e=>setFiltersLocal({...filtersLocal, agent:e.target.value})}>
                <option value="">Agent (all)</option>
                {agents.map(a => <option key={a._id} value={a.name}>{a.name}</option>)}
              </select>

              <div className="actions-row">
                <button type="button" className="btn" onClick={resetFilters}>Reset</button>
                <button className="btn primary" type="submit">Apply & View Cases</button>
              </div>
            </form>
          </div>
        </aside>
      )}

      {/* CASES VIEW */}
      {view === 'cases' && (
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div className="card-title">{tab==='active' ? 'Open Cases' : 'Archived Cases'}</div>
            <div className="tabs">
              <button className={`tab ${tab==='active'?'active':''}`} onClick={()=>setTab('active')}>Open</button>
              <button className={`tab ${tab==='archived'?'active':''}`} onClick={()=>setTab('archived')}>Closed</button>
            </div>
          </div>

          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th className="th-sort" onClick={()=>toggleSort('caseNumber')}># {sortIndicator('caseNumber')}</th>
                  <th className="th-sort" onClick={()=>toggleSort('customerName')}>Customer {sortIndicator('customerName')}</th>
                  <th className="th-sort" onClick={()=>toggleSort('issueType')}>Issue {sortIndicator('issueType')}</th>
                  <th className="th-sort" onClick={()=>toggleSort('priority')}>Priority {sortIndicator('priority')}</th>
                  <th className="th-sort" onClick={()=>toggleSort('agent')}>Agent {sortIndicator('agent')}</th>
                  <th className="th-sort" onClick={()=>toggleSort('status')}>Status {sortIndicator('status')}</th>
                  <th style={{ width: 260 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedCases.length===0 && (
                  <tr><td colSpan={7} style={{ padding: 16, color: '#64748b' }}>No cases.</td></tr>
                )}
                {sortedCases.map(c=>(
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
                          <button className="btn ghost" onClick={()=>toggleViewRow(c)}>
                            {selectedCase && selectedCase._id === c._id ? 'Hide' : 'View'}
                          </button>
                          {c.status !== 'Closed' && (
                            <button className="btn ghost" onClick={()=>closeCase(c._id)}>Close</button>
                          )}
                          {c.status === 'Closed' && (
                            <button className="btn ghost" onClick={()=>reactivateCase(c._id)}>Reactivate</button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {selectedCase && selectedCase._id === c._id && (
                      <tr>
                        <td colSpan={7}>
                          <div style={{ padding: 12, background:'#fff' }}>
                            <div className="muted" style={{ marginBottom: 6 }}>
                              <b>Customer:</b> {selectedCase.customerName} · {selectedCase.customerEmail || '—'} · {selectedCase.customerPhone || '—'}
                            </div>

                            <div className="muted" style={{ marginBottom: 6 }}>
                              Author: {user?.name || 'You'}
                            </div>

                            <div className="grid2" style={{ alignItems:'start' }}>
                              <input type="file" multiple onChange={e=>setLogFiles(Array.from(e.target.files || []))} />
                              <textarea placeholder="Note…" value={logNote} onChange={e=>setLogNote(e.target.value)} />
                            </div>
                            <div className="actions-row" style={{ marginTop: 8 }}>
                              <button className="btn primary" onClick={addLog}>Add log</button>
                            </div>

                            <ul className="loglist" style={{ marginTop: 10 }}>
                              {selectedCase.logs?.slice().reverse().map((log, i)=>(
                                <li key={i}>
                                  <b>{log.author}</b>
                                  <span className="muted"> — {new Date(log.at).toLocaleString()}</span>
                                  <div>{log.message}</div>
                                  {Array.isArray(log.files) && log.files.length>0 && (
                                    <div className="thumbs">
                                      {log.files.map((u, j)=>(
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
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="pagination">
            <button className="btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Prev</button>
            <span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span>
            <button className="btn" disabled={page>=Math.max(1, Math.ceil(total / pageSize))}
                    onClick={()=>setPage(p=>p+1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}