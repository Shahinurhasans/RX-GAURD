const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error || `Request failed: ${res.status}`);
  }
  return body;
}

export const api = {
  verifyPrescription: (id) => request(`/api/prescriptions/${id}/verify`)
};
