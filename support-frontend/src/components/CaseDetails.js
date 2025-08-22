import React, { useEffect, useState } from 'react';
import { fetchLogs, addLog, uploadFiles, deleteLog } from './api';

export default function CaseDetails({ selectedCase }) {
  const [logs, setLogs] = useState([]);
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const author = user ? user.name : '';

  const [message, setMessage] = useState('');
  const [files, setFiles] = useState([]);

  useEffect(() => {
    if (!selectedCase?._id) return;
    fetchLogs(selectedCase._id).then(setLogs).catch(() => setLogs([]));
  }, [selectedCase]);

  // Kill any select in Add Log area (safety)
  useEffect(() => {
    const kill = () => {
      const form = document.querySelector('.add-log-form');
      if (!form) return;
      form.querySelectorAll('select').forEach(s => s.remove());
    };
    kill();
    const id = setInterval(kill, 300);
    return () => clearInterval(id);
  }, []);

  async function handleAddLog(e) {
    e.preventDefault();
    if (!selectedCase?._id) return;

    let fileUrls = [];
    if (files && files.length > 0) {
      const { urls } = await uploadFiles(files);
      fileUrls = urls;
    }

    const created = await addLog(selectedCase._id, { author, message, files: fileUrls });
    setLogs(p => [created, ...p]);
    setMessage(''); setFiles([]); e.target.reset();
  }

  async function removeLog(logId) {
    if (!selectedCase?._id) return;
    if (!window.confirm('Delete this log?')) return;
    await deleteLog(selectedCase._id, logId);
    setLogs(p => p.filter(l => l._id !== logId));
  }

  if (!selectedCase?._id) return <div className="muted">Select a case…</div>;

  return (
    <div className="case-details">
      <style>{`.add-log-form select{display:none!important}`}</style>
      <h3 style={{marginTop:0}}>Case #{selectedCase.caseNumber || selectedCase._id}</h3>

      <form className="add-log-form" onSubmit={handleAddLog} style={{display:'grid',gap:8,marginBottom:16}}>
        <div style={{fontWeight:700}}>Logged by: {author || '—'}</div>

        <div>
          <label style={{display:'block',fontWeight:600}}>Note</label>
          <textarea value={message} onChange={e=>setMessage(e.target.value)} required rows={3}/>
        </div>

        <div>
          <label style={{display:'block',fontWeight:600}}>Screenshots (optional)</label>
          <input type="file" multiple accept="image/*" onChange={e=>setFiles(e.target.files)}/>
        </div>

        <div><button type="submit">Add log</button></div>
      </form>

      {logs.length ? (
        <ul style={{listStyle:'none',padding:0,margin:0}}>
          {logs.map(log=>(
            <li key={log._id} style={{borderBottom:'1px solid #eee',padding:'10px 0'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div><b>{log.author}</b> — <span className="muted">{new Date(log.createdAt).toLocaleString()}</span></div>
                <button className="link danger" onClick={()=>removeLog(log._id)}>Delete</button>
              </div>
              <div style={{marginTop:6}}>{log.message}</div>
            </li>
          ))}
        </ul>
      ) : <div className="muted">No logs yet.</div>}
    </div>
  );
}