import { useState } from 'react';
import { api } from './api.js';

export default function App() {
  const [prescriptionId, setPrescriptionId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleCheck(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await api.verifyPrescription(prescriptionId.trim());
      // Public/citizen view intentionally exposes only a validity boolean and
      // AWaRe category, not dose or prescriber details (whitepaper §7.2: the
      // public mirror chain returns a Boolean + merkle proof, not raw records).
      setResult({ valid: res.valid, awareCategory: res.awareCategory, status: res.status });
    } catch (err) {
      setError('No matching prescription found on the network.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="verify-shell">
      <div className="verify-card">
        <div className="verify-mark">&#10003;</div>
        <h1>Verify a Prescription</h1>
        <p className="tagline">
          Check whether a prescription is genuine and unfilled &mdash; no login
          needed, and no patient or clinical detail is shown here.
        </p>

        <form onSubmit={handleCheck}>
          <label>
            Prescription ID (from the receipt QR)
            <input
              value={prescriptionId}
              onChange={(e) => setPrescriptionId(e.target.value)}
              placeholder="rx-..."
              required
            />
          </label>
          <button type="submit" disabled={loading}>{loading ? 'Checking…' : 'Check authenticity'}</button>
        </form>

        {error && <div className="error">{error}</div>}

        {result && (
          <div className="result-box">
            <div className={`badge ${result.valid ? 'ok' : 'warn'}`}>
              {result.valid ? '✓ Genuine, unfilled prescription' : `Not currently dispensable (${result.status})`}
            </div>
            <p style={{ margin: 0, color: 'var(--muted)' }}>Category: {result.awareCategory}</p>
          </div>
        )}

        <p className="footnote">Rx-Guard &middot; Public Verification Layer</p>
      </div>
    </div>
  );
}
