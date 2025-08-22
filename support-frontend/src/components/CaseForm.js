import React, { useState } from 'react';
import { createCase } from './api';
import { ISSUE_TYPES, PRIORITIES } from './constants';

export default function CaseForm({ onCaseCreated }) {
  // who is logged in
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  const [form, setForm] = useState({
    customerName: '',
    issueType: ISSUE_TYPES[0],
    priority: PRIORITIES[0],
    description: ''
  });
  const [saving, setSaving] = useState(false);

  function change(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        agent: user ? user.name : '' // ✅ auto-use logged-in agent name
      };

      const created = await createCase(payload);
      onCaseCreated?.(created);

      setForm({
        customerName: '',
        issueType: ISSUE_TYPES[0],
        priority: PRIORITIES[0],
        description: ''
      });

      alert('Case created!');
    } catch (err) {
      alert(err.message || 'Failed to create case');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
      <h2 style={{ marginTop: 0 }}>Create New Case</h2>

      <label>Customer</label>
      <input name="customerName" value={form.customerName} onChange={change} required />

      <label>Issue type</label>
      <select name="issueType" value={form.issueType} onChange={change}>
        {ISSUE_TYPES.map(x => <option key={x}>{x}</option>)}
      </select>

      <label>Description</label>
      <textarea name="description" value={form.description} onChange={change} rows={3} />

      <label>Priority</label>
      <select name="priority" value={form.priority} onChange={change}>
        {PRIORITIES.map(x => <option key={x}>{x}</option>)}
      </select>

      {/* Agent dropdown removed */}

      <input type="file" style={{ display: 'block', marginTop: 6 }} />

      <div style={{ marginTop: 8 }}>
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Create Case'}
        </button>
      </div>
    </form>
  );
}