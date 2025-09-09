// src/App.js
import React, { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import Cases from './components/Cases';
import CreateCase from './components/CreateCase';

export default function App() {
  const [user, setUser] = useState(null);

  // Load saved user on first render
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || 'null');
      if (u) setUser(u);
    } catch {}
  }, []);

  // Not logged in → show login
  if (!user) return <Login onLoggedIn={setUser} />;

  // Logged in → show Dashboard shell; inside it either CreateCase or Cases
  return (
    <Dashboard
      onLogout={() => { localStorage.clear(); setUser(null); }}
      user={user}
    >
      {window.location.pathname.startsWith('/create') ? (
        <CreateCase />
      ) : (
        <Cases />
      )}
    </Dashboard>
  );
}