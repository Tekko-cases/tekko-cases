import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import './hide-agent';
import reportWebVitals from './reportWebVitals';
import { API_BASE } from './api';

// Warm the API once when the site opens
try { fetch(`${API_BASE}/health`, { cache: 'no-store' }); } catch {}


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

