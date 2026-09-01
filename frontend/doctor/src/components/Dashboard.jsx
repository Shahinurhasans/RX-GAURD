import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api.js';
import { DIAGNOSES, DRUGS } from '../constants.js';

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function Dashboard({ session, onLogout }) {
  const [form, setForm] = useState({
    patientHash: '',
    diagnosis: DIAGNOSES[0],
    drugCode: DRUGS[0],
    dose: '100mg twice daily',
    duration: '5 days',
    quantity: 10
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [blocked, setBlocked] = useState(null);
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setBlocked(null);
    setLoading(true);
    try {
      const prescriptionId = newId('rx');
      const patientHash = form.patientHash || newId('patient-hash');
      const res = await api.issuePrescription({
        prescriptionId,
        patientHash,
        diagnosis: form.diagnosis,
        drugCode: form.drugCode,
        dose: form.dose,
        duration: form.duration,
        quantity: Number(form.quantity)
      });
      setResult(res);
    } catch (err) {
      if (err.blocked) {
        setBlocked({ message: err.message, ai: err.ai });
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark">&#9877;</span>
          <span>
            Rx-Guard
            <span className="sub">Prescriber Portal</span>
          </span>
        </div>
        <div className="session-chip">
          <span>{session.name}</span>
          <button onClick={onLogout}>Log out</button>
        </div>
      </header>

      <main>
        <h2>Issue Prescription</h2>
        <p className="hint">
          No patient name is sent to the chain &mdash; only a hash and clinical attributes
          (whitepaper &sect;3.2). The AI appropriateness service is queried before the
          prescription is committed (&sect;7.5.1).
        </p>

        <form onSubmit={handleSubmit} className="card">
          <label>
            Patient reference hash (leave blank to auto-generate)
            <input value={form.patientHash} onChange={update('patientHash')} placeholder="auto" />
          </label>
          <label>
            Diagnosis
            <select value={form.diagnosis} onChange={update('diagnosis')}>
              {DIAGNOSES.map((d) => <option key={d} value={d}>{d.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
          <label>
            Proposed drug
            <select value={form.drugCode} onChange={update('drugCode')}>
              {DRUGS.map((d) => <option key={d} value={d}>{d.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
          <label>
            Dose
            <input value={form.dose} onChange={update('dose')} required />
          </label>
          <label>
            Duration
            <input value={form.duration} onChange={update('duration')} required />
          </label>
          <label>
            Quantity to dispense (units/tablets)
            <input type="number" min="1" value={form.quantity} onChange={update('quantity')} required />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? 'Submitting…' : 'Score & Issue Prescription'}
          </button>
        </form>

        {error && <div className="error">{error}</div>}

        {blocked && (
          <div className="card">
            <div className="badge warn">
              Not permitted &mdash; appropriateness {Math.round(blocked.ai.appropriateness_score * 100)}%
            </div>
            <p>{blocked.message}</p>
            {blocked.ai.alternative_drug && (
              <p>Suggested alternative: <strong>{blocked.ai.alternative_drug.replaceAll('_', ' ')}</strong></p>
            )}
          </div>
        )}

        {result && (
          <div className="card">
            <h3>Prescription committed to chain</h3>
            <div className={`badge ${result.ai.recommendation === 'accept' ? 'ok' : 'warn'}`}>
              {result.ai.aware_category} &middot; appropriateness {Math.round(result.ai.appropriateness_score * 100)}%
              &middot; {result.ai.recommendation === 'accept' ? 'first-line choice' : 'consider alternative'}
            </div>
            {result.ai.alternative_drug && (
              <p>Suggested alternative: <strong>{result.ai.alternative_drug.replaceAll('_', ' ')}</strong></p>
            )}
            <p>Prescription ID: <code>{result.prescription.prescriptionId}</code></p>
            <p>Quantity: <strong>{result.prescription.quantity}</strong></p>
            <p>Model version: <code>{result.ai.model_version}</code> ({result.ai.model_version_hash.slice(0, 16)}&hellip;)</p>
            <div className="qr">
              <QRCodeSVG value={result.prescription.prescriptionId} size={160} />
              <p className="hint">Patient scans this at the pharmacy counter</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
