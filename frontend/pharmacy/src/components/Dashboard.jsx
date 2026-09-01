import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { DRUGS } from '../constants.js';

export default function Dashboard({ session, onLogout }) {
  const [prescriptionId, setPrescriptionId] = useState('');
  const [verified, setVerified] = useState(null);
  const [dispensed, setDispensed] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [stock, setStock] = useState([]);
  const [stockForm, setStockForm] = useState({ drugCode: DRUGS[0], quantity: 100 });
  const [auditForm, setAuditForm] = useState({ drugCode: DRUGS[0], physicalCount: 0 });
  const [stockError, setStockError] = useState(null);
  const [stockLoading, setStockLoading] = useState(false);

  async function loadStock() {
    try {
      setStock(await api.getOwnStock());
    } catch (err) {
      setStockError(err.message);
    }
  }

  useEffect(() => { loadStock(); }, []);

  async function handleVerify(e) {
    e.preventDefault();
    setError(null);
    setDispensed(null);
    setVerified(null);
    setLoading(true);
    try {
      const res = await api.verifyPrescription(prescriptionId.trim());
      setVerified(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDispense() {
    setError(null);
    setLoading(true);
    try {
      const res = await api.dispensePrescription(prescriptionId.trim(), {
        dispensedDrugCode: verified.drugCode
      });
      setDispensed(res);
      setVerified({ ...verified, status: res.status, valid: false });
      loadStock();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReceipt(e) {
    e.preventDefault();
    setStockError(null);
    setStockLoading(true);
    try {
      await api.recordStockReceipt(stockForm);
      await loadStock();
    } catch (err) {
      setStockError(err.message);
    } finally {
      setStockLoading(false);
    }
  }

  async function handleAudit(e) {
    e.preventDefault();
    setStockError(null);
    setStockLoading(true);
    try {
      await api.reportStockAudit(auditForm);
      await loadStock();
    } catch (err) {
      setStockError(err.message);
    } finally {
      setStockLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark">&#128138;</span>
          <span>
            Rx-Guard
            <span className="sub">Pharmacy Portal</span>
          </span>
        </div>
        <div className="session-chip">
          <span>{session.name}</span>
          <button onClick={onLogout}>Log out</button>
        </div>
      </header>

      <main>
        <h2>Verify & Dispense</h2>
        <p className="hint">
          Scan the QR (or paste the prescription ID) to query the chain for state,
          drug, dose and duration before handing over medicine (&sect;7.5.2).
        </p>

        <form onSubmit={handleVerify} className="card">
          <label>
            Prescription ID
            <input
              value={prescriptionId}
              onChange={(e) => setPrescriptionId(e.target.value)}
              placeholder="rx-..."
              required
            />
          </label>
          <button type="submit" disabled={loading}>Verify on chain</button>
        </form>

        {error && <div className="error">{error}</div>}

        {verified && (
          <div className="card">
            <div className={`badge ${verified.valid ? 'ok' : 'warn'}`}>
              {verified.valid ? 'VALID & UNFILLED' : `NOT DISPENSABLE (${verified.status})`}
            </div>
            <p>Drug: <strong>{verified.drugCode.replaceAll('_', ' ')}</strong> ({verified.awareCategory})</p>
            <p>Dose: {verified.dose} &middot; Duration: {verified.duration} &middot; Quantity: <strong>{verified.quantity}</strong></p>
            <p>AI appropriateness score at issuance: {Math.round(verified.appropriatenessScore * 100)}%</p>
            {verified.valid && (
              <button onClick={handleDispense} disabled={loading}>
                {loading ? 'Dispensing…' : `Confirm ${verified.quantity} dispensed & commit to chain`}
              </button>
            )}
          </div>
        )}

        {dispensed && (
          <div className="card">
            <h3>Dispensing event committed</h3>
            <p>
              Prescription is now <strong>{dispensed.status}</strong>
              {' '}({dispensed.quantity} units) and cannot be reused.
            </p>
          </div>
        )}

        <h2>Inventory</h2>
        <p className="hint">
          Every on-chain dispense auto-decrements expected stock. Log what comes in
          and what a physical shelf count finds &mdash; a shortfall against what
          the chain can account for is what the regulator dashboard flags as
          possible sales made without a prescription.
        </p>

        <div className="card">
          <form onSubmit={handleReceipt} className="inline-form">
            <label>
              Drug received
              <select value={stockForm.drugCode} onChange={(e) => setStockForm({ ...stockForm, drugCode: e.target.value })}>
                {DRUGS.map((d) => <option key={d} value={d}>{d.replaceAll('_', ' ')}</option>)}
              </select>
            </label>
            <label className="qty">
              Quantity
              <input type="number" min="1" value={stockForm.quantity} onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })} />
            </label>
            <button type="submit" disabled={stockLoading}>Record receipt</button>
          </form>

          <form onSubmit={handleAudit} className="inline-form">
            <label>
              Drug audited
              <select value={auditForm.drugCode} onChange={(e) => setAuditForm({ ...auditForm, drugCode: e.target.value })}>
                {DRUGS.map((d) => <option key={d} value={d}>{d.replaceAll('_', ' ')}</option>)}
              </select>
            </label>
            <label className="qty">
              Physical count
              <input type="number" min="0" value={auditForm.physicalCount} onChange={(e) => setAuditForm({ ...auditForm, physicalCount: e.target.value })} />
            </label>
            <button type="submit" disabled={stockLoading}>Report physical count</button>
          </form>

          {stockError && <div className="error">{stockError}</div>}

          <table>
            <thead>
              <tr><th>Drug</th><th>Received</th><th>Dispensed</th><th>Expected</th><th>Last count</th><th>Discrepancy</th></tr>
            </thead>
            <tbody>
              {stock.map((s) => (
                <tr key={s.drugCode}>
                  <td>{s.drugCode.replaceAll('_', ' ')}</td>
                  <td>{s.totalReceived}</td>
                  <td>{s.totalDispensed}</td>
                  <td>{s.expectedStock}</td>
                  <td>{s.lastReportedPhysical ?? '—'}</td>
                  <td>{s.discrepancy > 0 ? <strong>{s.discrepancy}</strong> : (s.discrepancy ?? '—')}</td>
                </tr>
              ))}
              {stock.length === 0 && (
                <tr><td colSpan={6}>No stock recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
