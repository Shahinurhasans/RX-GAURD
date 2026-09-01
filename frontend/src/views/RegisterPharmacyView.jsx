import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { setSession } from '../auth.js';

export default function RegisterPharmacyView() {
  const [form, setForm] = useState({ name: '', email: '', password: '', licenseNumber: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.registerPharmacy(form);
      setSession(res);
      navigate('/pharmacist');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2>Register &mdash; Pharmacy</h2>
      <p className="hint">
        Dispensing authorization is enforced by Fabric organisation membership
        (PharmacyOrgMSP), not by this account record &mdash; this registration
        just gives your counter staff a login and ties dispensing events to
        your pharmacy's identity for the regulator dashboard.
      </p>

      <form onSubmit={handleSubmit} className="card">
        <label>
          Pharmacy name
          <input value={form.name} onChange={update('name')} placeholder="Dhanmondi Pharmacy" required />
        </label>
        <label>
          Drug licence number
          <input value={form.licenseNumber} onChange={update('licenseNumber')} required />
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
