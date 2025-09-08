// src/components/Cases.jsx
import React, { useEffect, useState } from 'react';
import { tekkoListCases, tekkoCloseCase, tekkoReopenCase, tekkoDeleteCase } from '../tekko-api';

export default function Cases() {
  const [view, setView] = useState('open');
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('view') || 'open';
    setView(v.toLowerCase());
  }, []);

  useEffect(() => { refresh(); }, [view]);

  async function refresh() {
    const data = await tekkoListCases(view);
    setRows(Array.isArray(data) ? data : []);
  }

  async function act(id, what) {
    if (what === 'close') await tekkoCloseCase(id);
    if (what === 'reopen') await tekkoReopenCase(id);
    if (what === 'delete') await tekkoDeleteCase(id);
    refresh();
  }

  return (
    <div className="container">
      <div className="toolbar">
        <div className="tabs">
          <a className={\`tab \${view==='open'?'tab--active':''}\`} href="/cases?view=open">Open</a>
          <a className={\`tab \${view==='archived'?'tab--active':''}\`} href="/cases?view=archived">Archived</a>
        </div>
        <a className="btn btn--primary" href="/create">Create case</a>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>#</th><th>Customer</th><th>Issue</th><th>Priority</th><th>Agent</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan="7" className="muted">No cases.</td></tr>
            )}
            {rows.map(r => (
              <tr key={r._id}>
                <td>{r.caseNumber}</td>
                <td>{r.customerName}</td>
                <td>{r.issueType}</td>
                <td>{r.priority}</td>
                <td>{r.agent || '—'}</td>
                <td>{r.status}</td>
                <td className="actions">
                  {view === 'open' ? (
                    <>
                      <button className="btn btn--amber" onClick={() => act(r._id, 'close')}>Close</button>
                      <button className="btn btn--danger" onClick={() => act(r._id, 'delete')}>Delete</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn--green" onClick={() => act(r._id, 'reopen')}>Reopen</button>
                      <button className="btn btn--danger" onClick={() => act(r._id, 'delete')}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
