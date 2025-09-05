// src/components/CreateCase.jsx
import React, { useState } from 'react';
import { tekkoCreateCase } from '../api';

const ISSUE_TYPES = ['Plans','Billing','Technical','Activation','Shipping','Rentals','Other'];
const PRIORITIES = ['Low','Normal','High','Urgent'];

export default function CreateCase() {
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [phones, setPhones] = useState([]);
  const [description, setDescription] = useState('');
  const [issueType, setIssueType] = useState('Other');
  const [priority, setPriority] = useState('Normal');
  const [files, setFiles] = useState([]);

  function addPhone() {
    if (phone.trim()) {
      setPhones(p => [...p, phone.trim()]);
      setPhone('');
    }
  }

  async function submit(e) {
    e.preventDefault();
    const payload = {
      customerName,
      description,
      issueType,
      priority,
      phoneNumbers: [...phones, phone].filter(Boolean),
    };
    try {
      await tekkoCreateCase(payload, files);
      alert('Case created.');
      window.location.href = '/cases?view=open';
    } catch (err) {
      alert('Create case failed: ' + (err.message || 'Error'));
    }
  }

  return (
    <div className="container">
      <h1 className="title">Create New Case</h1>

      <form onSubmit={submit} className="card form">
        <div className="grid">
          <input className="input" placeholder="Customer name" value={customerName} onChange={e=>setCustomerName(e.target.value)} required />
          <div className="phoneAdder">
            <input className="input" placeholder="+1 phone" value={phone} onChange={e=>setPhone(e.target.value)} />
            <button type="button" className="btn btn--light" onClick={addPhone}>+ Add another number</button>
            {phones.length>0 && <div className="muted small">Added: {phones.join(', ')}</div>}
          </div>
        </div>

        <div className="grid grid--desc">
          <textarea className="textarea" placeholder="Describe the issue" value={description} onChange={e=>setDescription(e.target.value)} />
          <div className="side">
            <select className="input" value={issueType} onChange={e=>setIssueType(e.target.value)}>
              {ISSUE_TYPES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <select className="input" value={priority} onChange={e=>setPriority(e.target.value)}>
              {PRIORITIES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <input type="file" multiple onChange={e=>setFiles(Array.from(e.target.files||[]))}/>
          </div>
        </div>

        <div className="actions">
          <button className="btn btn--primary">Create Case</button>
          <a className="btn" href="/cases?view=open">Cancel</a>
        </div>
      </form>
    </div>
  );
}