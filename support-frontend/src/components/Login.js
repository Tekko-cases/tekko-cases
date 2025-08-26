// support-frontend/src/components/Login.js
import React, { useState } from 'react';
import { api } from './api'; // api.js sits in the same folder

export default function Login() {
  const [email, setEmail] = useState('info@assistly.group');
  const [password, setPassword] = useState('');

  async function doLogin(e) {
    e.preventDefault();
    try {
      // Try /login first (backend original), then fall back to /api/login
      let res;
      try {
        res = await api.post('/login', { email, password });
      } catch (e1) {
        res = await api.post('/api/login', { email, password });
      }

      const data = res?.data || {};
      const token = data.token;
      const user  = data.user || { name: (email || '').split('@')[0], role: 'Agent', email };

      if (!token) throw new Error('No token from server');

      // Save auth
      try { localStorage.setItem('token', token); } catch {}
      try { localStorage.setItem('user', JSON.stringify(user)); } catch {}

      // Go to app
      window.location.href = '/';
    } catch (err) {
      console.error(err);
      alert('Login failed');
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={doLogin}>
        <h2>Tekko cases — Sign in</h2>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e)=>setPassword(e.target.value)}
        />
        <button className="btn primary" type="submit">Log in</button>
        <div className="muted" style={{marginTop:8}}>Use the admin you seeded in .env</div>
      </form>
    </div>
  );
}