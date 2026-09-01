import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { setSession } from '../auth.js';

function roleHome(role) {
  if (role === 'doctor') return '/prescriber';
  if (role === 'pharmacy') return '/pharmacist';
  return '/regulator';
}

export default function LoginView() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(form);
      setSession(res);
      navigate(roleHome(res.role));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2>Log in</h2>
      <form onSubmit={handleSubmit} className="card">
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

      {error && <div className="error">{error}</div>}

      <p className="hint">
        New here?{' '}
        <a href="/register/doctor">Register as a doctor</a>,{' '}
        <a href="/register/pharmacy">register a pharmacy</a>, or{' '}
        <a href="/register/regulator">register as a regulator</a>.
      </p>
    </section>
  );
}
