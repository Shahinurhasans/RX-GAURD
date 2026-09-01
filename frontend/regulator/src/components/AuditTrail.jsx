import { useState } from 'react';
import { api } from '../api.js';

export default function AuditTrail() {
  const [prescriptionId, setPrescriptionId] = useState('');
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleLookup(e) {
    e.preventDefault();
    setError(null);
    setHistory(null);
    setLoading(true);
    try {
      const res = await api.getPrescriptionHistory(prescriptionId.trim());
      setHistory(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2>Prescription Audit Trail</h2>
      <p className="hint">
        Every state change to a prescription is a separate, permanent
        ledger transaction with its own transaction ID and timestamp &mdash;
        nothing can be edited or deleted after the fact, by anyone, including
        the prescriber, the pharmacy, or DGDA itself.
      </p>

      <form onSubmit={handleLookup} className="card">
        <label>
          Prescription ID
          <input
            value={prescriptionId}
            onChange={(e) => setPrescriptionId(e.target.value)}
            placeholder="rx-..."
            required
          />
        </label>
        <button type="submit" disabled={loading}>Look up history</button>
      </form>

      {error && <div className="error">{error}</div>}

      {history && (
        <div className="card">
          <h3>{history.length} transaction(s) on this record</h3>
          <table>
            <thead>
              <tr><th>Timestamp</th><th>Status</th><th>Drug</th><th>Transaction ID</th></tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={h.txId || i}>
                  <td>{h.timestamp?.seconds ? new Date(h.timestamp.seconds * 1000).toLocaleString() : '—'}</td>
                  <td>{h.isDelete ? 'deleted' : (h.value?.status ?? '—')}</td>
                  <td>{h.value?.drugCode?.replaceAll('_', ' ') ?? '—'}</td>
                  <td><code>{h.txId ? `${h.txId.slice(0, 16)}…` : '—'}</code></td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={4}>No history found for this prescription ID.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
