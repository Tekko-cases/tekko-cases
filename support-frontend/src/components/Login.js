import React, { useState } from 'react';
import { api } from '../api';
import './Dashboard.css';

export default function Login({ onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function submit(e) {
    e.preventDefault();
    try {
      const r = await api.post('/api/auth/login', { email, password });
      localStorage.setItem('token', r.data.token);
      localStorage.setItem('user', JSON.stringify(r.data.user));
      onLoggedIn(r.data.user);
    } catch (err) {
      alert('Login failed');
    }
  }

  return (
    <div className="page" style={{minHeight:'100vh', display:'grid', placeItems:'center'}}>
      <div className="card" style={{ width: 420 }}>
        <div className="card-title">Tekko cases — Sign in</div>
        <form onSubmit={submit} className="grid2">
          <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          <div className="actions-row">
            <button type="submit" className="btn primary">Log in</button>
          </div>
        </form>
        <div className="muted" style={{marginTop:8}}>Use the admin you seeded in .env</div>
      </div>
    </div>
  );
}