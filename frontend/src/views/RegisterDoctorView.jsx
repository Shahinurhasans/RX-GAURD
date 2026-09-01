import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { setSession } from '../auth.js';

export default function RegisterDoctorView() {
  const [form, setForm] = useState({ name: '', email: '', password: '', registrationBody: 'BMDC' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.registerDoctor(form);
      setSession(res);
      navigate('/prescriber');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2>Register &mdash; Doctor / Prescriber</h2>
      <p className="hint">
        Registering here writes your prescriber record onto the Fabric ledger
        (whitepaper &sect;7.5.1) &mdash; only registered prescribers can issue
        prescriptions the network will accept.
      </p>

      <form onSubmit={handleSubmit} className="card">
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

      {error && <div className="error">{error}</div>}

      <p className="hint">Already registered? <a href="/login">Log in</a>.</p>
    </section>
  );
}
