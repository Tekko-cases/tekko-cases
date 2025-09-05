// src/App.js  (full replacement)
import React, { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import Cases from './components/Cases';
import CreateCase from './components/CreateCase';

export default function App() {
  const [user, setUser] = useState(null);

  // load saved user (same as you had)
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || 'null');
      if (u) setUser(u);
    } catch {}
  }, []);

  // not logged in → show your existing Login screen
  if (!user) return <Login onLoggedIn={setUser} />;

  // logged in → show Dashboard shell, and inside it either CreateCase or Cases
  return (
    <Dashboard
      onLogout={() => { localStorage.clear(); setUser(null); }}
      user={user}
    >
      {window.location.pathname.startsWith('/create')
        ? <CreateCase />
        : <Cases />
      }
    </Dashboard>
  );
}