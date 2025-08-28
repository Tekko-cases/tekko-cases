// support-frontend/src/components/Login.js
import React, { useState } from 'react';

const API_BASE =
  (process.env.REACT_APP_API_URL && process.env.REACT_APP_API_URL.replace(/\/+$/, '')) ||
  'https://tekko-cases.onrender.com';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState(''); // agent name OR email
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username || !password) {
      setError('Please enter your name and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/login-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Login failed');

      if (data.token) localStorage.setItem('token', data.token);
      if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      if (typeof onLogin === 'function') onLogin(data.user);

      window.location.href = '/';
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrapper}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h2 style={styles.title}>Agent Sign In</h2>

        <label style={styles.label}>Agent name</label>
        <input
          type="text"
          placeholder="e.g. Toby"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={styles.input}
          autoFocus
        />

        <label style={styles.label}>Password</label>
        <input
          type="password"
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
        />

        {error ? <div style={styles.error}>{error}</div> : null}

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  wrapper: { minHeight: '70vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f7f7f8' },
  card: {
    width: '100%', maxWidth: 420, padding: 24, background: '#fff', borderRadius: 16,
    boxShadow: '0 6px 20px rgba(0,0,0,0.06)', display: 'grid', gap: 10,
  },
  title: { margin: 0, marginBottom: 6, fontSize: 22, fontWeight: 700 },
  label: { fontSize: 13, color: '#555', marginTop: 8 },
  input: { padding: '10px 12px', border: '1px solid #ddd', borderRadius: 10, fontSize: 15, outline: 'none' },
  button: { marginTop: 12, padding: '10px 14px', borderRadius: 10, border: 'none', background: '#111827', color: '#fff', fontWeight: 600, cursor: 'pointer' },
  error: { marginTop: 6, color: '#b00020', background: '#fde8e8', border: '1px solid #f7c6c6', borderRadius: 10, padding: '8px 10px', fontSize: 14 },
};