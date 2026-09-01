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
  registerRegulator: (data) =>
    request('/api/auth/register/regulator', { method: 'POST', body: JSON.stringify(data) }),

  login: (data) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),

  getPharmacies: () =>
    request('/api/regulator/pharmacies'),

  getPharmacyDispensing: (pharmacyId) =>
    request(`/api/regulator/pharmacies/${pharmacyId}/dispensing`),

  getPharmacyStock: (pharmacyId) =>
    request(`/api/regulator/pharmacies/${pharmacyId}/stock`)
};
