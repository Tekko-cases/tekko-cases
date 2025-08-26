// support-frontend/src/components/api.js
import axios from 'axios';

// Use Netlify env (set in netlify.toml or Site config)
export const API_BASE =
  (process.env.REACT_APP_API_BASE || '').replace(/\/$/, '') || '';

const instance = axios.create({
  baseURL: API_BASE || '/',   // absolute if provided, otherwise relative
  withCredentials: false,
});

// Attach token if present
instance.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});

// Export BOTH ways so all imports work
export const api = instance;   // named export
export default instance;       // default export