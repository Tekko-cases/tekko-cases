// src/App.js
import React, { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard';
import Login from './components/Login';

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || 'null');
      if (u) setUser(u);
    } catch {}
  }, []);

  if (!user) return <Login onLoggedIn={setUser} />;

  return (
    <Dashboard
      onLogout={() => { localStorage.clear(); setUser(null); }}
      user={user}
    />
  );
}