// support-frontend/src/api.js
import axios from 'axios';

// Base URL for the API (set on Netlify as REACT_APP_API_BASE)
export const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3001';

// Single axios client used everywhere
export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
});

// --- IMPORTANT ---
// Your backend exposes POST /login (no /api prefix).
// The frontend sometimes calls POST /api/login.
// This interceptor rewrites that one request so it always hits /login.
api.interceptors.request.use((config) => {
  if (config && typeof config.url === 'string') {
    if (config.url === '/api/login') {
      config.url = '/login';
    }
  }
  return config;
});

export default api;
