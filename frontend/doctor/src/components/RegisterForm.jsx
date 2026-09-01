import { useState } from 'react';
import { api } from '../api.js';
import { setSession } from '../auth.js';

export default function RegisterForm({ onRegister, onSwitchToLogin }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', registrationBody: 'BMDC' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.registerDoctor(form);
      setSession(res);
      onRegister(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand"><span className="mark">&#9877;</span> Rx-Guard</div>
        <p className="tagline">Register as a doctor / prescriber</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label>
            Full name
            <input value={form.name} onChange={update('name')} placeholder="Dr. Jane Doe" required />
          </label>
          <label>
            Registration body & number
            <input value={form.registrationBody} onChange={update('registrationBody')} placeholder="BMDC-A-12345" required />
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

        {error && <div className="error" style={{ marginTop: 16 }}>{error}</div>}

        <p className="hint" style={{ marginTop: 20 }}>
          Already registered?{' '}
          <button type="button" className="link-btn" onClick={onSwitchToLogin}>Log in</button>
        </p>
      </div>
    </div>
  );
}
