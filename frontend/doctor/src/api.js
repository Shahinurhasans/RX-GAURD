import { getSession } from './auth.js';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

async function request(path, options = {}) {
  const session = getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;

  const res = await fetch(`${API_BASE}${path}`, { headers, ...options });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error || `Request failed: ${res.status}`);
  }
  return body;
}

export const api = {
  registerDoctor: (data) =>
    request('/api/auth/register/doctor', { method: 'POST', body: JSON.stringify(data) }),

  login: (data) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),

  issuePrescription: (data) =>
    request('/api/prescriptions', { method: 'POST', body: JSON.stringify(data) })
};
