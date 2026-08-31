import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api.js';

const DIAGNOSES = [
  'uti_uncomplicated', 'uti_complicated', 'typhoid', 'neonatal_sepsis',
  'pneumonia_cap', 'skin_soft_tissue', 'gonorrhea', 'meningitis'
];

const DRUGS = [
  'amoxicillin', 'nitrofurantoin', 'doxycycline', 'metronidazole', 'gentamicin',
  'amoxicillin_clavulanate', 'ampicillin', 'ciprofloxacin', 'azithromycin',
  'ceftriaxone', 'cefixime', 'clarithromycin', 'meropenem', 'colistin',
  'linezolid', 'tigecycline'
];

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function PrescriberView() {
  const [form, setForm] = useState({
    prescriberId: 'prescriber-001',
    patientHash: '',
    diagnosis: DIAGNOSES[0],
    drugCode: DRUGS[0],
    dose: '100mg twice daily',
    duration: '5 days'
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleRegisterPrescriber() {
    setError(null);
    try {
      await api.registerPrescriber({
        prescriberId: form.prescriberId,
        name: 'Dr. Demo Prescriber',
        registrationBody: 'BMDC'
      });
    } catch (err) {
      // registration is idempotent-ish for the demo; ignore "already registered"
      if (!/already registered/i.test(err.message)) setError(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      await handleRegisterPrescriber();
      const prescriptionId = newId('rx');
      const patientHash = form.patientHash || newId('patient-hash');
      const res = await api.issuePrescription({
        prescriptionId,
        patientHash,
        diagnosis: form.diagnosis,
        drugCode: form.drugCode,
        dose: form.dose,
        duration: form.duration,
        prescriberId: form.prescriberId
      });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2>Prescriber &mdash; Issue Prescription</h2>
      <p className="hint">
        No patient name is sent to the chain &mdash; only a hash and clinical attributes
        (whitepaper &sect;3.2). The AI appropriateness service is queried before the
        prescription is committed (&sect;7.5.1).
      </p>

      <form onSubmit={handleSubmit} className="card">
        <label>
          Prescriber ID
          <input value={form.prescriberId} onChange={update('prescriberId')} required />
        </label>
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
        <button type="submit" disabled={loading}>
          {loading ? 'Submitting…' : 'Score & Issue Prescription'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {result && (
        <div className="card result">
          <h3>Prescription committed to chain</h3>
          <div className={`badge ${result.ai.recommendation === 'accept' ? 'ok' : 'warn'}`}>
            {result.ai.aware_category} &middot; appropriateness {Math.round(result.ai.appropriateness_score * 100)}%
            &middot; {result.ai.recommendation === 'accept' ? 'first-line choice' : 'consider alternative'}
          </div>
          {result.ai.alternative_drug && (
            <p>Suggested alternative: <strong>{result.ai.alternative_drug.replaceAll('_', ' ')}</strong></p>
          )}
          <p>Prescription ID: <code>{result.prescription.prescriptionId}</code></p>
          <p>Model version: <code>{result.ai.model_version}</code> ({result.ai.model_version_hash.slice(0, 16)}&hellip;)</p>
          <div className="qr">
            <QRCodeSVG value={result.prescription.prescriptionId} size={160} />
            <p className="hint">Patient scans this at the pharmacy counter</p>
          </div>
        </div>
      )}
    </section>
  );
}
