import axios from 'axios';

export const API_BASE = 'http://localhost:5000';

export const api = axios.create({
  baseURL: API_BASE,
});

// attach token automatically
api.interceptors.request.use((config) => {
  const t = localStorage.getItem('token');
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});