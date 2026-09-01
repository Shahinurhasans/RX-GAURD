import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { setSession } from '../auth.js';

export default function RegisterRegulatorView() {
  const [form, setForm] = useState({ name: '', email: '', password: '', agency: 'DGDA' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.registerRegulator(form);
      setSession(res);
      navigate('/regulator');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2>Register &mdash; Regulator</h2>
      <p className="hint">
        For government drug-authority staff (DGDA) who need the aggregated
        dispensing and stock-discrepancy view across pharmacies (&sect;7.5.3).
      </p>

      <form onSubmit={handleSubmit} className="card">
        <label>
          Full name
          <input value={form.name} onChange={update('name')} placeholder="Jane Inspector" required />
        </label>
        <label>
          Agency
          <input value={form.agency} onChange={update('agency')} placeholder="DGDA" required />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={update('email')} required />
        </label>
        <label>
          Password
          <input type="password" value={form.password} onChange={update('password')} required minLength={8} />
        </label>
        <button type="submit" disabled={loading}>{loading ? 'Registering…' : 'Register'}</button>
      </form>

      {error && <div className="error">{error}</div>}

      <p className="hint">Already registered? <a href="/login">Log in</a>.</p>
    </section>
  );
}
