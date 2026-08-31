import { useState } from 'react';
import { api } from '../api.js';

export default function PublicVerifyView() {
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
    <section>
      <h2>Public Verification</h2>
      <p className="hint">
        Anyone can confirm a prescription is genuine without seeing patient or
        clinical detail &mdash; this mirrors the whitepaper's public verification
        layer (&sect;7.2), simplified here to query the same permissioned network directly.
      </p>

      <form onSubmit={handleCheck} className="card">
        <label>
          Prescription ID (from the receipt QR)
          <input
            value={prescriptionId}
            onChange={(e) => setPrescriptionId(e.target.value)}
            placeholder="rx-..."
            required
          />
        </label>
        <button type="submit" disabled={loading}>Check authenticity</button>
      </form>

      {error && <div className="error">{error}</div>}

      {result && (
        <div className="card result">
          <div className={`badge ${result.valid ? 'ok' : 'warn'}`}>
            {result.valid ? '✓ Genuine, unfilled prescription' : `Not currently dispensable (${result.status})`}
          </div>
          <p>Category: {result.awareCategory}</p>
        </div>
      )}
    </section>
  );
}
