import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Prescribers() {
  const [prescribers, setPrescribers] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { load(); }, []);

  function load() {
    setLoading(true);
    setError(null);
    api.getPrescribers()
      .then(setPrescribers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  function startRevoke(prescriberId) {
    setRevokingId(prescriberId);
    setReason('');
    setActionError(null);
  }

  async function confirmRevoke(prescriberId) {
    setActionError(null);
    setActionLoading(true);
    try {
      await api.revokePrescriber(prescriberId, reason || 'Revoked by regulator');
      setRevokingId(null);
      load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div>
      <h2>Prescriber Oversight</h2>
      <p className="hint">
        Revoking a prescriber writes it to the ledger immediately &mdash; every
        pharmacy on the network rejects that prescriber's future prescriptions
        from that moment on, with no phone calls or emails needed (whitepaper
        &sect;7.5.1).
      </p>

      {loading && <p className="hint">Loading prescribers…</p>}
      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <div className="card">
          <table>
            <thead>
              <tr><th>Name</th><th>Registration</th><th>Issued</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {prescribers.map((p) => (
                <tr key={p.prescriberId}>
                  <td>{p.name}<div className="hint">{p.prescriberId}</div></td>
                  <td>{p.registrationBody}</td>
                  <td>
                    {p.prescriptionsIssued}
                    {p.flagged && (
                      <div className="badge warn" style={{ marginTop: 4 }}>
                        {p.lowScoreCount} low-score prescriptions
                      </div>
                    )}
                  </td>
                  <td>
                    {p.active === true && <span className="badge ok">Active</span>}
                    {p.active === false && <span className="badge warn">Revoked</span>}
                    {p.active === null && <span className="hint">Unknown</span>}
                  </td>
                  <td>
                    {p.active === true && revokingId !== p.prescriberId && (
                      <button onClick={() => startRevoke(p.prescriberId)}>Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
              {prescribers.length === 0 && (
                <tr><td colSpan={5}>No registered doctors yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {revokingId && (
        <div className="card">
          <h3>Confirm revocation</h3>
          <label>
            Reason
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Fraudulent prescriptions reported"
            />
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => confirmRevoke(revokingId)} disabled={actionLoading}>
              {actionLoading ? 'Revoking…' : 'Confirm revoke'}
            </button>
            <button
              onClick={() => setRevokingId(null)}
              style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              Cancel
            </button>
          </div>
          {actionError && <div className="error">{actionError}</div>}
        </div>
      )}
    </div>
  );
}
