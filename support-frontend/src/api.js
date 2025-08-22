// support-frontend/src/api.js
import axios from 'axios';

// API base comes from Netlify env var
export const API_BASE =
  process.env.REACT_APP_API_BASE || 'http://localhost:3001';

// Create axios client
export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
});

// Map the frontend's old path to the backend's actual path
api.interceptors.request.use((config) => {
  const u = config.url || '';
  if (u === '/api/login') {
    config.url = '/login';
  }
  return config;
});