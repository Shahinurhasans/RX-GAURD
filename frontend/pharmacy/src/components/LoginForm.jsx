import { useState } from 'react';
import { api } from '../api.js';
import { setSession } from '../auth.js';

export default function LoginForm({ onLogin, onSwitchToRegister }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(form);
      if (res.role !== 'pharmacy') {
        throw new Error('This portal is for pharmacy accounts only.');
      }
      setSession(res);
      onLogin(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand"><span className="mark">&#128138;</span> Rx-Guard</div>
        <p className="tagline">Pharmacy Portal &mdash; log in to verify & dispense</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label>
            Email
            <input type="email" value={form.email} onChange={update('email')} required />
          </label>
          <label>
            Password
            <input type="password" value={form.password} onChange={update('password')} required />
          </label>
          <button type="submit" disabled={loading}>{loading ? 'Logging in…' : 'Log in'}</button>
        </form>

        {error && <div className="error" style={{ marginTop: 16 }}>{error}</div>}

        <p className="hint" style={{ marginTop: 20 }}>
          New pharmacy?{' '}
          <button type="button" className="link-btn" onClick={onSwitchToRegister}>Register here</button>
        </p>
      </div>
    </div>
  );
}
