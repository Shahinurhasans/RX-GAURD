import { useState } from 'react';
import { api } from '../api.js';

export default function PharmacistView() {
  const [prescriptionId, setPrescriptionId] = useState('');
  const [pharmacyId, setPharmacyId] = useState('pharmacy-dhanmondi-01');
  const [pharmacistId, setPharmacistId] = useState('pharmacist-001');
  const [verified, setVerified] = useState(null);
  const [dispensed, setDispensed] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

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
        pharmacyId, pharmacistId, dispensedDrugCode: verified.drugCode
      });
      setDispensed(res);
      setVerified({ ...verified, status: res.status, valid: false });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2>Pharmacist &mdash; Verify & Dispense</h2>
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
        <label>
          Pharmacy ID
          <input value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)} required />
        </label>
        <label>
          Pharmacist ID
          <input value={pharmacistId} onChange={(e) => setPharmacistId(e.target.value)} required />
        </label>
        <button type="submit" disabled={loading}>Verify on chain</button>
      </form>

      {error && <div className="error">{error}</div>}

      {verified && (
        <div className="card result">
          <div className={`badge ${verified.valid ? 'ok' : 'warn'}`}>
            {verified.valid ? 'VALID & UNFILLED' : `NOT DISPENSABLE (${verified.status})`}
          </div>
          <p>Drug: <strong>{verified.drugCode.replaceAll('_', ' ')}</strong> ({verified.awareCategory})</p>
          <p>Dose: {verified.dose} &middot; Duration: {verified.duration}</p>
          <p>AI appropriateness score at issuance: {Math.round(verified.appropriatenessScore * 100)}%</p>
          {verified.valid && (
            <button onClick={handleDispense} disabled={loading}>
              {loading ? 'Dispensing…' : 'Confirm dispensed & commit to chain'}
            </button>
          )}
        </div>
      )}

      {dispensed && (
        <div className="card result">
          <h3>Dispensing event committed</h3>
          <p>Prescription is now <strong>{dispensed.status}</strong> and cannot be reused.</p>
        </div>
      )}
    </section>
  );
}
